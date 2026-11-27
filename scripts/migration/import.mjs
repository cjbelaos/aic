// Loads a captured snapshot into the aic schema (plan §3).
//
//   node scripts/migration/import.mjs <snapshotDir> --dry-run
//   node --env-file=.env.local scripts/migration/import.mjs <snapshotDir> [--db-env=STAGING_DATABASE_URL] [--replace] [--fail-after=<table>]
//
// Validation (types, missing/duplicate keys, orphaned references) runs before any connection. The load is
// one transaction: other sessions see nothing until commit, and an interruption rolls everything back, so a
// retry starts from the same empty state. Counts are reconciled inside the transaction before commit.
// --replace truncates the aic tables first (staging rehearsals only). --fail-after aborts after loading the
// named table, to rehearse interruption. Output contains names, counts and source row numbers only; the
// report is written next to the snapshot (git-ignored).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SCHEMA } from "./schema-map.mjs";
import { buildImport, loadOrder } from "./convert.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name) => flag(name)?.split("=")[1];
if (!dir) throw new Error("usage: import.mjs <snapshotDir> [--dry-run] [--db-env=NAME] [--replace] [--fail-after=table]");

const body = readFileSync(`${dir}/database.json`, "utf8");
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
const sha256 = createHash("sha256").update(body).digest("hex");
if (sha256 !== manifest.sha256) throw new Error("snapshot checksum does not match manifest.json");
const snapshot = JSON.parse(body);

const { tables, report } = buildImport(snapshot);
const order = loadOrder();
const counts = Object.fromEntries(order.map((t) => [t, tables.get(t).rows.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const n = (o) => Object.values(o).reduce((a, v) => a + (Array.isArray(v) ? v.length : v), 0);
const summary = `${order.length} tables, ${total} rows; rejected ${n(report.rejected)}, excluded ${n(report.excluded)}, rekeyed ${n(report.rekeyed)}, orphaned refs ${n(report.orphans)}, unconverted cells ${n(report.conversionFailures)}, unmapped cells ${n(report.unmappedColumns)}`;
const batchId = `import-${manifest.capturedAt.replace(/[:.]/g, "-")}-${Date.now()}`;
const reportPath = `${dir}/import-report.json`;
writeFileSync(reportPath, JSON.stringify({ batchId, sha256, capturedAt: manifest.capturedAt, dryRun: !!flag("dry-run"), counts, ...report }, null, 2));
console.log(summary);
console.log(`report -> ${reportPath}`);
if (flag("dry-run")) process.exit(0);

const envName = value("db-env") || "STAGING_DATABASE_URL";
const url = process.env[envName];
if (!url) throw new Error(`${envName} is not set`);
const target = new URL(url);
console.log(`target: ${target.hostname} as ${decodeURIComponent(target.username)} (${envName})`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: "aic-import" });
await client.connect();
const qi = (id) => `"${id.replace(/"/g, '""')}"`;
const failAfter = value("fail-after");
try {
  await client.query("begin");
  await client.query("select set_config('aic.importing', 'on', true), set_config('aic.actor', 'system:import', true)");
  const all = order.map((t) => `${SCHEMA}.${t}`).join(", ");
  const { rows: existing } = await client.query(`select sum(n)::int as n from (${order.map((t) => `select count(*) as n from ${SCHEMA}.${t}`).join(" union all ")}) s`);
  if (existing[0].n > 0) {
    if (!flag("replace")) throw new Error(`aic already holds ${existing[0].n} rows; pass --replace to reload staging`);
    await client.query(`truncate ${all} restart identity`);
    // App-side records that refer to documents (retry log, pending Google jobs) belong to the replaced data.
    const appTables = (await client.query("select to_regclass('aic.request_log') is not null as r, to_regclass('aic.outbox') is not null as o")).rows[0];
    if (appTables.r) await client.query("truncate aic.request_log");
    if (appTables.o) await client.query("truncate aic.outbox restart identity");
  }
  for (const t of order) {
    const { columns, rows } = tables.get(t);
    if (rows.length) {
      const cols = columns.map(qi).join(", ");
      await client.query(
        `insert into ${SCHEMA}.${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::${SCHEMA}.${t}, $1::jsonb)`,
        [JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null]))))],
      );
    }
    if (failAfter === t) throw new Error(`--fail-after=${t}: simulated interruption`);
  }
  const { rows: got } = await client.query(order.map((t) => `select '${t}' as t, count(*)::int as n from ${SCHEMA}.${t}`).join(" union all "));
  const mismatched = got.filter((g) => g.n !== counts[g.t]);
  if (mismatched.length) throw new Error(`count mismatch: ${mismatched.map((g) => `${g.t} ${g.n}/${counts[g.t]}`).join(", ")}`);
  await client.query(
    `insert into ${SCHEMA}.import_batches (batch_id, snapshot_sha256, captured_at, promoted_at, counts, report, created_by, created_at)
     values ($1, $2, $3, now(), $4, $5, 'system:import', now())`,
    [batchId, sha256, manifest.capturedAt, JSON.stringify(counts), JSON.stringify(report)],
  );
  await client.query("commit");
  console.log(`promoted batch ${batchId}`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`rolled back: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

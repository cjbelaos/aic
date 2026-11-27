// Post-import checks against the database (plan §3): counts vs the import report, batch record,
// audit-trigger enforcement and API-role isolation. Prints counts and booleans only.
//   node --env-file=.env.local scripts/migration/verify-import.mjs <snapshotDir> [--db-env=STAGING_DATABASE_URL]
import pg from "pg";
import { readFileSync } from "node:fs";
const envName = process.argv.find((a) => a.startsWith("--db-env="))?.split("=")[1] || "STAGING_DATABASE_URL";
const expected = JSON.parse(readFileSync(`${process.argv[2]}/import-report.json`, "utf8")).counts;
const c = new pg.Client({ connectionString: process.env[envName], ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
const got = await q(Object.keys(expected).map((t) => `select '${t}' t, count(*)::int n from aic.${t}`).join(" union all "));
const bad = got.filter((g) => g.n !== expected[g.t]);
console.log(`counts: ${got.length} tables, ${got.reduce((a, g) => a + g.n, 0)} rows, mismatches: ${bad.length ? JSON.stringify(bad) : "none"}`);
console.log("batches:", (await q("select count(*)::int n, count(promoted_at)::int promoted from aic.import_batches"))[0]);
console.log("audit kept (products created_at non-null / null created_by on users):", (await q("select (select count(created_at) from aic.products)::int p_ca, (select count(*) filter (where created_by is null) from aic.users)::int u_cb_null"))[0]);
console.log("surrogate ids restart at 1:", (await q("select min(id)::int mn, max(id)::int mx, count(*)::int n from aic.delivery_receipt_items"))[0]);
for (const [label, sql] of [
  ["write without actor", "begin; update aic.departments set department_name = department_name where department_id = (select min(department_id) from aic.departments); rollback;"],
  ["aic_app with importing=on, no actor", "begin; grant aic_app to current_user; set local role aic_app; select set_config('aic.importing','on',true); update aic.departments set department_name = department_name where department_id = (select min(department_id) from aic.departments); rollback;"],
]) {
  try { await c.query(sql); console.log(`${label}: ALLOWED (unexpected)`); } catch (e) { await c.query("rollback").catch(() => {}); console.log(`${label}: rejected (${e.message})`); }
}
await c.query("begin; grant aic_app to current_user; set local role aic_app; select set_config('aic.actor','test:verify',true);");
const r = await q("update aic.departments set department_name = department_name where department_id = (select min(department_id) from aic.departments) returning updated_by, updated_at is not null as stamped, created_at is null as ca_null");
await c.query("rollback");
console.log("aic_app with actor:", r[0]);
console.log("anon/authenticated schema usage:", (await q("select has_schema_privilege('anon','aic','usage') anon, has_schema_privilege('authenticated','aic','usage') auth"))[0]);
await c.end();

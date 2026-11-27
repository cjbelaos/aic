// Applies pending supabase/migrations/*.sql files, each in its own transaction, and records them in
// supabase_migrations.schema_migrations (the table the Supabase CLI and dashboard read).
//
//   node --env-file=.env.local scripts/migration/apply-migrations.mjs [--db-env=STAGING_DATABASE_URL]
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const envName = process.argv.find((a) => a.startsWith("--db-env="))?.split("=")[1] || "STAGING_DATABASE_URL";
const url = process.env[envName];
if (!url) throw new Error(`${envName} is not set`);
const target = new URL(url);
console.log(`target: ${target.hostname} as ${decodeURIComponent(target.username)} (${envName})`);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: "aic-migrate" });
await client.connect();
try {
  await client.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const done = new Set(rows.map((r) => r.version));
  const files = readdirSync("supabase/migrations").filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(file);
    if (done.has(version)) { console.log(`skip    ${file}`); continue; }
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)", [version, [sql], name]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (e) {
      await client.query("rollback");
      throw new Error(`${file}: ${e.message}`);
    }
  }
} finally {
  await client.end();
}

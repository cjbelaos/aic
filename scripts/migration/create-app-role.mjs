// Creates (or rotates the password of) the app's login role `aic_web`, a member of aic_app, and writes
// its transaction-pooler connection string to .env.local as <TARGET>_APP_DATABASE_URL. The password is
// generated here and never printed.
//
//   node --env-file=.env.local scripts/migration/create-app-role.mjs [--db-env=STAGING_DATABASE_URL]
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const envName = process.argv.find((a) => a.startsWith("--db-env="))?.split("=")[1] || "STAGING_DATABASE_URL";
const admin = new URL(process.env[envName]);
const ref = decodeURIComponent(admin.username).split(".")[1];
if (!ref) throw new Error(`${envName} must be a Supabase pooler URL (user postgres.<project-ref>)`);
const password = randomBytes(24).toString("base64url");

const client = new pg.Client({ connectionString: admin.href, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'aic_web') then create role aic_web login noinherit; end if;
end $$`);
await client.query(`alter role aic_web login inherit password '${password}'`);
await client.query("grant aic_app to aic_web");
await client.end();

const app = new URL(admin.href);
app.username = encodeURIComponent(`aic_web.${ref}`);
app.password = password;
app.port = "6543"; // transaction pooler: suits serverless functions
const key = envName.replace(/_DATABASE_URL$/, "") + "_APP_DATABASE_URL";
const env = readFileSync(".env.local", "utf8").split(/\r?\n/).filter((line) => !line.startsWith(`${key}=`));
while (env.length && env.at(-1) === "") env.pop();
writeFileSync(".env.local", [...env, `${key}=${app.href}`, ""].join("\n"));
console.log(`aic_web ready on ${app.hostname}:${app.port}; connection string written to .env.local as ${key}`);

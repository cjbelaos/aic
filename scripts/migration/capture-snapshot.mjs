// Capture a read-only snapshot of the operational Database workbook (plan §3).
//
//   node --env-file=.env.local scripts/migration/capture-snapshot.mjs [outDir]
//
// Two batchGet requests (FORMATTED_VALUE = what the app reads today, UNFORMATTED_VALUE =
// raw numbers / date serials). Excluded tabs (credentials, templates, locks) are never read.
// Output contains personal and financial data: it goes to a git-ignored directory and must
// never be committed, pasted or logged. Prints only tab names and counts.
import { google } from "googleapis";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const EXCLUDED_TABS = new Set([
  "Config", // holds a credential
  "DeliveryReceiptForm", "ServiceInvoiceForm", "PurchaseOrderForm", // PDF templates
  "_FTI_WRITE_LOCK", "_INVENTORY_WRITE_LOCK",
]);

function auth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || (file && existsSync(file) ? readFileSync(file, "utf8") : process.env.GOOGLE_PRIVATE_KEY);
  if (!raw) throw new Error("No service-account credential configured.");
  const t = raw.trim();
  if (t.startsWith("{")) { const j = JSON.parse(t); return new google.auth.JWT({ email: j.client_email || email, key: j.private_key, scopes }); }
  return new google.auth.JWT({ email, key: t.replace(/\\n/g, "\n"), scopes });
}

const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID_DATABASE is not set.");
const capturedAt = new Date().toISOString();
const outDir = process.argv[2] || `tmp/migration/snapshot-${capturedAt.replace(/[:.]/g, "-")}`;

const sheets = google.sheets({ version: "v4", auth: auth() });
const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
const tabs = meta.data.sheets.map((s) => s.properties.title).filter((t) => !EXCLUDED_TABS.has(t));
const ranges = tabs.map((t) => `'${t.replace(/'/g, "''")}'`);
const [formatted, raw] = await Promise.all(
  ["FORMATTED_VALUE", "UNFORMATTED_VALUE"].map((valueRenderOption) =>
    sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, valueRenderOption, dateTimeRenderOption: "SERIAL_NUMBER" })),
);

const snapshot = { capturedAt, source: "database", tabs: {} };
tabs.forEach((tab, i) => {
  snapshot.tabs[tab] = {
    formatted: formatted.data.valueRanges[i].values || [],
    raw: raw.data.valueRanges[i].values || [],
  };
});
mkdirSync(outDir, { recursive: true });
const body = JSON.stringify(snapshot);
writeFileSync(`${outDir}/database.json`, body);
const manifest = {
  capturedAt,
  sha256: createHash("sha256").update(body).digest("hex"),
  tabs: Object.fromEntries(tabs.map((t) => [t, Math.max(0, snapshot.tabs[t].formatted.length - 1)])),
};
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`captured ${tabs.length} tabs, ${Object.values(manifest.tabs).reduce((a, b) => a + b, 0)} rows -> ${outDir}`);

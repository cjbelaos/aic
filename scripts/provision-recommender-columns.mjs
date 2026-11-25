// Adds the SalesOrders recommender columns (AL RecommendedByUserId, AM RecommendedByName).
// Dry run by default; pass --apply to write. Never overwrites a non-blank header.
// Run: node --env-file=.env.local scripts/provision-recommender-columns.mjs [--apply]
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const TAB = "SalesOrders";
const EXPECTED_BEFORE = 37; // A..AK, ending with BillingType
const HEADERS = ["RecommendedByUserId", "RecommendedByName"];
const apply = process.argv.includes("--apply");

function credentials() {
  const unescape = (key) => key.replace(/\\n/g, "\n");
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: unescape(raw) };
    const parsed = JSON.parse(raw);
    return { email: parsed.client_email, key: unescape(parsed.private_key) };
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const file = readFileSync(keyFile, "utf8").trim();
    if (file.startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file };
    const parsed = JSON.parse(file);
    return { email: parsed.client_email, key: unescape(parsed.private_key) };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: unescape(process.env.GOOGLE_PRIVATE_KEY) };
  }
  throw new Error("Configure service-account credentials.");
}

const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties(columnCount))" });
const sheet = meta.data.sheets.find((s) => s.properties.title === TAB)?.properties;
if (!sheet) throw new Error(`${TAB} tab not found.`);
const width = sheet.gridProperties.columnCount;
const header = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!1:1` })).data.values?.[0] ?? [];
if (header[EXPECTED_BEFORE - 1] !== "BillingType") throw new Error(`Unexpected layout: column ${EXPECTED_BEFORE} is "${header[EXPECTED_BEFORE - 1]}", expected "BillingType".`);
for (let i = 0; i < HEADERS.length; i += 1) {
  const current = String(header[EXPECTED_BEFORE + i] ?? "").trim();
  if (current && current !== HEADERS[i]) throw new Error(`Column ${EXPECTED_BEFORE + i + 1} already holds "${current}"; refusing to overwrite.`);
}
const needed = Math.max(0, EXPECTED_BEFORE + HEADERS.length - width);
console.log(JSON.stringify({ tab: TAB, gridColumns: width, columnsToAdd: needed, headersToWrite: HEADERS, apply }));
if (!apply) { console.log("Dry run only. Re-run with --apply to write."); process.exit(0); }

if (needed > 0) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: needed } },
  ] } });
}
await sheets.spreadsheets.values.update({
  spreadsheetId, range: `${TAB}!AL1:AM1`, valueInputOption: "RAW", requestBody: { values: [HEADERS] },
});
const after = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!AJ1:AM1` })).data.values?.[0];
console.log("Done. Header tail now:", JSON.stringify(after));

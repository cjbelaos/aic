// Read-only: grid width and trailing headers of the Quotations and SalesOrders tabs.
// Run: node --env-file=.env.local scripts/inspect-recommender-columns.mjs
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

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
const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,gridProperties(columnCount))" });
for (const tab of ["Quotations", "SalesOrders"]) {
  const width = meta.data.sheets.find((s) => s.properties.title === tab)?.properties.gridProperties.columnCount;
  const header = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` })).data.values?.[0] ?? [];
  console.log(JSON.stringify({ tab, gridColumns: width, headerCount: header.length, lastHeaders: header.slice(-4) }));
}

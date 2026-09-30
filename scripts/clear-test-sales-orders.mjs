// Clear only the app's Sales Order records from the database workbook.
// Run without --apply to inspect counts. Never touches the Sales Order Tracker.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const tabs = [
  "SalesOrders", "SalesOrderItems", "SalesOrderHistory", "SalesOrderDocuments",
  "SalesOrderFulfillments", "SalesOrderDocumentLinks", "SalesOrderCommands",
  "SalesOrderImportMap",
];
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID_DATABASE is missing.");
if (spreadsheetId === process.env.SALES_ORDER_DESTINATION_SPREADSHEET_ID) {
  throw new Error("The database workbook matches the Tracker destination; refusing to clear it.");
}

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") };
    const parsed = JSON.parse(raw);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const file = readFileSync(keyFile, "utf8").trim();
    if (file.startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file };
    const parsed = JSON.parse(file);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth;
}

const auth = typeof credentials().getAccessToken === "function"
  ? credentials()
  : new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title)" });
const names = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title));
for (const tab of tabs) if (!names.has(tab)) throw new Error(`Missing ${tab}; no changes made.`);
const ranges = tabs.map((tab) => `'${tab}'!A2:AZ`);
const read = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
const counts = Object.fromEntries(tabs.map((tab, index) => [tab,
  (read.data.valueRanges?.[index]?.values ?? []).filter((row) => row.some((cell) => String(cell ?? "").trim())).length,
]));
console.log(JSON.stringify(counts, null, 2));
if (!process.argv.includes("--apply")) process.exit(0);
if (!counts.SalesOrders) throw new Error("No SalesOrders found; no changes made.");
await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges } });
const after = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
for (const [index, tab] of tabs.entries()) {
  if ((after.data.valueRanges?.[index]?.values ?? []).some((row) => row.some((cell) => String(cell ?? "").trim()))) {
    throw new Error(`${tab} still has records after clear.`);
  }
}
console.log("Cleared and verified app Sales Order records. Headers, sequences, other tabs, and the Tracker were untouched.");

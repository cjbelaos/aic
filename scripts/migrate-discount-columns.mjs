// Append-only schema migration. Default: read-only preview. --apply writes only
// four blank header cells and expands grids when needed; never changes data rows.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const columns = [
  { tab: "Quotations", column: "V", index: 21, header: "DiscountSettings" },
  { tab: "QuotationDetails", column: "M", index: 12, header: "LineMetadata" },
  { tab: "SalesOrders", column: "AJ", index: 35, header: "DiscountSettings" },
  { tab: "SalesOrderItems", column: "AF", index: 31, header: "DiscountSettings" },
];
if (process.argv.includes("--print-headers")) { for (const entry of columns) console.log(`${entry.tab}!${entry.column}1: ${entry.header}`); process.exit(0); }
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "aic-service-account@aic-nextjs-sheets-db-501208.iam.gserviceaccount.com";
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8") : process.env.GOOGLE_PRIVATE_KEY);
if (!raw) throw new Error("Missing Google service account credentials.");
const credentials = raw.trim().startsWith("-----BEGIN") ? { client_email: email, private_key: raw } : JSON.parse(raw);
const auth = new google.auth.JWT({ email: credentials.client_email || email, key: credentials.private_key.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties.columnCount)" });
const requests = [], writes = [];
// Check every target before making any change. Reject occupied columns, including
// data under a blank header, rather than relabeling unrelated information.
for (const entry of columns) {
  const tab = metadata.data.sheets.find(sheet => sheet.properties.title === entry.tab)?.properties;
  if (!tab) throw new Error(`Missing tab: ${entry.tab}`);
  const count = tab.gridProperties.columnCount;
  if (count > entry.index) {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${entry.tab}!${entry.column}:${entry.column}` });
    const values = response.data.values || [];
    const header = String(values[0]?.[0] || "").trim();
    if (header === entry.header) { console.log(`${entry.tab}!${entry.column}: already ready`); continue; }
    if (values.some(row => row.some(value => String(value || "").trim()))) throw new Error(`${entry.tab}!${entry.column} is occupied; migration stopped.`);
  } else requests.push({ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { columnCount: entry.index + 1 } }, fields: "gridProperties.columnCount" } });
  writes.push({ range: `${entry.tab}!${entry.column}1`, values: [[entry.header]] });
  console.log(`${entry.tab}!${entry.column}1: add ${entry.header}`);
}
if (!process.argv.includes("--apply")) { console.log("Preview only. Run with --apply to append these headers."); process.exit(0); }
if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
if (writes.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: writes } });
console.log("Discount columns ready. Existing rows were left unchanged.");

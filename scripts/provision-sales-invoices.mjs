// Idempotent additive provisioning. Dry run by default; --apply creates only missing Sales Invoice tabs/headers.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";
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
  throw new Error("No Google credentials found (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_PRIVATE_KEY).");
}

const source = readFileSync("src/lib/invoiceRepository.ts", "utf8");
const headers = [...source.match(/const SERVICE_INVOICES_HEADERS = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
const definitions = { SalesInvoices: headers, SalesInvoiceItems: ["InvoiceNo", "Description", "Qty", "UnitPrice", "Amount", "ProductId", "ProductCategoryId"] };
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing database spreadsheet ID.");
const { email, key } = credentials();
const sheets = google.sheets({ version: "v4", auth: new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
const titles = metadata.data.sheets.map(s => s.properties.title);
for (const [title, expected] of Object.entries(definitions)) {
  let actual = [];
  if (titles.includes(title)) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A1:U2` });
    actual = res.data.values?.[0] || [];
    if (actual.length && expected.some((name, i) => name !== actual[i])) throw new Error(`${title} has incompatible headers; left unchanged.`);
    if (!actual.length && res.data.values?.[1]?.length) throw new Error(`${title} has data without headers; left unchanged.`);
    if (actual.length) { console.log(`${title}: schema verified.`); continue; }
  }
  if (!process.argv.includes("--apply")) { console.log(`${title}: would provision ${expected.length} columns.`); continue; }
  if (!titles.includes(title)) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 1 } } } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${title}!A1`, valueInputOption: "RAW", requestBody: { values: [expected] } });
  console.log(`${title}: provisioned ${expected.length} headers.`);
}

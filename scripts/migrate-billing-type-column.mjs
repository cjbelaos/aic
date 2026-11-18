// Append-only schema migration for Sales Order billing type.
// Default: read-only preview. --apply widens the SalesOrders grid, writes header
// cells and fills blank BillingType (AK) cells; no other cell is changed.
//
//   node --env-file=.env.local scripts/migrate-billing-type-column.mjs           # preview
//   node --env-file=.env.local scripts/migrate-billing-type-column.mjs --apply   # write
//
// AJ1 (DiscountSettings) is also labelled when blank: the app already writes
// discount JSON there, so the script checks every value is JSON before labelling.
//
// Backfill: every order with a blank BillingType gets one, written to AK only.
// An order already invoiced follows that invoice (ServiceInvoices -> SR,
// SalesInvoices -> SI); otherwise the category default used for new orders.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const TAB = "SalesOrders";
const LABEL_EXISTING = { column: "AJ", header: "DiscountSettings" };
const APPEND = { column: "AK", index: 36, header: "BillingType" };

const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");

function buildAuth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || (keyFile && existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "");
  if (raw.trim()) {
    const parsed = raw.trim().startsWith("{") ? JSON.parse(raw) : null;
    return new google.auth.JWT({ email: parsed?.client_email || email, key: (parsed?.private_key || raw).replace(/\\n/g, "\n"), scopes });
  }
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

const sheets = google.sheets({ version: "v4", auth: buildAuth() });
const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties.columnCount)" });
const tab = metadata.data.sheets.find((sheet) => sheet.properties.title === TAB)?.properties;
if (!tab) throw new Error(`Missing tab: ${TAB}`);

const requests = [];
const writes = [];
const column = async (letter) => (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!${letter}:${letter}` })).data.values ?? [];

// AJ: label only; the data below it must already be discount JSON.
{
  const values = await column(LABEL_EXISTING.column);
  const header = String(values[0]?.[0] ?? "").trim();
  if (header === LABEL_EXISTING.header) console.log(`${TAB}!${LABEL_EXISTING.column}1: already ${header}`);
  else if (header) throw new Error(`${TAB}!${LABEL_EXISTING.column}1 holds "${header}"; migration stopped.`);
  else {
    const bad = values.slice(1).map((row) => String(row?.[0] ?? "").trim()).filter((value) => value && !value.startsWith("{"));
    if (bad.length) throw new Error(`${TAB}!${LABEL_EXISTING.column} has ${bad.length} non-JSON value(s); migration stopped.`);
    writes.push({ range: `${TAB}!${LABEL_EXISTING.column}1`, values: [[LABEL_EXISTING.header]] });
    console.log(`${TAB}!${LABEL_EXISTING.column}1: label ${LABEL_EXISTING.header}`);
  }
}

// AK: widen the grid if needed, then add the header. Reject occupied columns.
{
  const count = tab.gridProperties.columnCount;
  if (count > APPEND.index) {
    const values = await column(APPEND.column);
    const header = String(values[0]?.[0] ?? "").trim();
    if (header === APPEND.header) console.log(`${TAB}!${APPEND.column}1: already ${header}`);
    else if (values.some((row) => row.some((value) => String(value ?? "").trim()))) throw new Error(`${TAB}!${APPEND.column} is occupied; migration stopped.`);
    else {
      writes.push({ range: `${TAB}!${APPEND.column}1`, values: [[APPEND.header]] });
      console.log(`${TAB}!${APPEND.column}1: add ${APPEND.header}`);
    }
  } else {
    requests.push({ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { columnCount: APPEND.index + 1 } }, fields: "gridProperties.columnCount" } });
    writes.push({ range: `${TAB}!${APPEND.column}1`, values: [[APPEND.header]] });
    console.log(`${TAB}: widen grid ${count} -> ${APPEND.index + 1} columns; ${APPEND.column}1: add ${APPEND.header}`);
  }
}

// Backfill plan. Mirrors deriveOrderCategory + defaultBillingType in
// src/lib/salesOrders/domain.ts and billing.ts.
const read = async (range) => (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
const [orderRows, itemRows, serviceRows, salesRows] = await Promise.all([
  read(`${TAB}!A2:AK`), read("SalesOrderItems!A2:Z"), read("ServiceInvoices!A2:U"), read("SalesInvoices!A2:U"),
]);
const BILLED = new Set(["draft", "created", "paid"]);
const invoicedBy = new Map();
for (const [rows, type] of [[serviceRows, "SERVICE_INVOICE"], [salesRows, "SALES_INVOICE"]]) {
  for (const row of rows) {
    const orderId = String(row[18] ?? "").trim();
    if (orderId && BILLED.has(String(row[8] ?? "").trim()) && !invoicedBy.has(orderId)) invoicedBy.set(orderId, type);
  }
}
const categoriesBy = new Map();
for (const row of itemRows) {
  if ((String(row[25] ?? "").trim() || "ACTIVE") !== "ACTIVE") continue;
  const category = String(row[3] ?? "").trim();
  if (!category) continue;
  const orderId = String(row[1] ?? "").trim();
  categoriesBy.set(orderId, (categoriesBy.get(orderId) ?? new Set()).add(category));
}
function derivedCategory(set = new Set()) {
  const unique = [...set];
  if (unique.some((c) => c.toLowerCase() === "project")) return "Project";
  if (unique.some((c) => /^(services?\s*\/\s*repair|service)$/i.test(c))) return "Service";
  return unique.join(" / ");
}
const backfill = [];
const tally = { fromInvoice: 0, fromCategory: 0, SERVICE_INVOICE: 0, SALES_INVOICE: 0 };
orderRows.forEach((row, index) => {
  const orderId = String(row[0] ?? "").trim();
  if (!orderId || String(row[36] ?? "").trim()) return;
  const fromInvoice = invoicedBy.get(orderId);
  const type = fromInvoice ?? (/\b(service|services|pms)\b/i.test(derivedCategory(categoriesBy.get(orderId))) ? "SERVICE_INVOICE" : "SALES_INVOICE");
  tally[fromInvoice ? "fromInvoice" : "fromCategory"] += 1;
  tally[type] += 1;
  backfill.push({ range: `${TAB}!${APPEND.column}${index + 2}`, values: [[type]], orderNo: String(row[1] ?? "") });
});
console.log(`Backfill ${backfill.length} order(s): ${tally.fromInvoice} from an existing invoice, ${tally.fromCategory} from category; SR ${tally.SERVICE_INVOICE}, SI ${tally.SALES_INVOICE}.`);
for (const sample of process.argv.filter((arg) => /^AIC-SO-/.test(arg))) {
  console.log(`  ${sample}: ${backfill.find((entry) => entry.orderNo === sample)?.values[0][0] ?? "(already set or not found)"}`);
}

if (!process.argv.includes("--apply")) {
  console.log(writes.length || requests.length || backfill.length ? "Preview only. Run with --apply to make these changes." : "Nothing to do.");
  process.exit(0);
}
if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
if (writes.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: writes } });
for (let start = 0; start < backfill.length; start += 500) {
  const data = backfill.slice(start, start + 500).map(({ range, values }) => ({ range, values }));
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
}
console.log(`Billing type column ready; ${backfill.length} order(s) backfilled in ${APPEND.column} only.`);

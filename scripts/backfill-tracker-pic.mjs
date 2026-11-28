// One-off backfill: Sales Order Tracker PIC (column U) = the order's Recommended By name.
// Default: read-only preview. --apply writes U on app rows only and removes the
// PIC dropdown (data validation on U2:U). No other cell is changed.
//
//   node --env-file=.env.local scripts/backfill-tracker-pic.mjs           # preview
//   node --env-file=.env.local scripts/backfill-tracker-pic.mjs --apply   # write
//
// A row is an app row when it has an AppSalesOrderId (column X). A row whose
// order has no Recommended By keeps its current PIC; pre-app rows are never touched.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const APPLY = process.argv.includes("--apply");
const PIC_INDEX = 20; // U
const ORDER_ID_INDEX = 23; // X (AppSalesOrderId)
const RECOMMENDED_BY_NAME_INDEX = 38; // SalesOrders!AM

const databaseId = process.env.GOOGLE_SHEET_ID_DATABASE;
const trackerId = process.env.SALES_ORDER_DESTINATION_SPREADSHEET_ID?.trim();
const trackerSheetId = Number(process.env.SALES_ORDER_DESTINATION_TRACKER_SHEET_ID);
if (!databaseId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");
if (!trackerId || !Number.isInteger(trackerSheetId)) {
  throw new Error("Missing SALES_ORDER_DESTINATION_SPREADSHEET_ID / SALES_ORDER_DESTINATION_TRACKER_SHEET_ID.");
}

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

const text = (value) => String(value ?? "").trim();
const sheets = google.sheets({ version: "v4", auth: buildAuth() });

const orderRows = (await sheets.spreadsheets.values.get({
  spreadsheetId: databaseId, range: "SalesOrders!A2:AM", valueRenderOption: "UNFORMATTED_VALUE",
})).data.values ?? [];
const nameByOrderId = new Map(orderRows.map((row) => [text(row[0]), text(row[RECOMMENDED_BY_NAME_INDEX])]).filter(([id]) => id));

const metadata = await sheets.spreadsheets.get({
  spreadsheetId: trackerId, fields: "sheets.properties(sheetId,title,gridProperties.rowCount)",
});
const tab = metadata.data.sheets.find((sheet) => sheet.properties.sheetId === trackerSheetId)?.properties;
if (!tab) throw new Error("Configured Sales Order Tracker sheet was not found.");
const quoted = `'${tab.title.replace(/'/g, "''")}'`;

const trackerRows = (await sheets.spreadsheets.values.get({
  spreadsheetId: trackerId, range: `${quoted}!A1:X`, valueRenderOption: "UNFORMATTED_VALUE",
})).data.values ?? [];
if (text(trackerRows[0]?.[PIC_INDEX]) !== "PIC" || text(trackerRows[0]?.[ORDER_ID_INDEX]) !== "AppSalesOrderId") {
  throw new Error("Tracker header mismatch: expected U1 = PIC and X1 = AppSalesOrderId.");
}

const updates = [];
let appRows = 0, noName = 0, unknownOrder = 0, unchanged = 0;
trackerRows.slice(1).forEach((row, index) => {
  const orderId = text(row[ORDER_ID_INDEX]);
  if (!orderId) return;
  appRows++;
  if (!nameByOrderId.has(orderId)) { unknownOrder++; return; }
  const name = nameByOrderId.get(orderId);
  if (!name) { noName++; return; }
  const current = text(row[PIC_INDEX]);
  if (current === name) { unchanged++; return; }
  const rowNumber = index + 2;
  updates.push({ range: `${quoted}!U${rowNumber}`, values: [[name]] });
  console.log(`row ${rowNumber}  tracker ${text(row[0]) || "?"}  "${current}" -> "${name}"`);
});

console.log(`\nApp rows: ${appRows}. To write: ${updates.length}. Already correct: ${unchanged}. ` +
  `No Recommended By (kept): ${noName}. Order not found (kept): ${unknownOrder}.`);
console.log(`Dropdown on U2:U${tab.gridProperties.rowCount} will be removed.`);

if (!APPLY) {
  console.log("\nPreview only. Re-run with --apply to write.");
} else {
  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: trackerId, requestBody: { valueInputOption: "RAW", data: updates },
    });
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: trackerId,
    requestBody: { requests: [{ setDataValidation: {
      range: { sheetId: trackerSheetId, startRowIndex: 1, endRowIndex: tab.gridProperties.rowCount, startColumnIndex: PIC_INDEX, endColumnIndex: PIC_INDEX + 1 },
    } }] },
  });
  console.log(`\nApplied: ${updates.length} PIC cells written; dropdown removed.`);
}

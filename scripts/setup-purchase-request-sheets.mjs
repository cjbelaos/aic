// Purchase Request sheet setup. Audit by default; `--apply` creates missing tabs and header cells.
//   npm run setup:purchase-requests            (report only)
//   npm run setup:purchase-requests -- --apply (create)
// Additive only: never clears or overwrites existing data rows.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const APPLY = process.argv.includes("--apply");
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") };
    const parsed = JSON.parse(raw); return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const file = readFileSync(keyFile, "utf8").trim();
    if (file.startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file };
    const parsed = JSON.parse(file); return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  throw new Error("Configure service-account credentials before running the setup.");
}

const NEW_TABS = {
  PurchaseRequests: ["PrId", "PrNo", "Status", "SalesOrderId", "SalesOrderNo", "CustomerName", "QuotationNo", "DeliveryAddress", "RequestedByUserId", "RequestedByName", "RequestedDate", "NeededByDate", "Purpose", "CancelReason", "Version", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy", "RequestType", "ContractId", "ContractNo"],
  PurchaseRequestItems: ["PrItemId", "PrId", "LineNo", "ProductId", "ProductCode", "ProductName", "UnitId", "Unit", "Quantity", "SalesOrderItemId", "Remarks", "FromStockQty", "FromStockNote", "FromStockBy", "FromStockAt", "CancelledQty", "CancelReason", "CancelledBy", "CancelledAt", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy", "ContractItemId"],
  PurchaseRequestLinks: ["LinkId", "PoNumber", "PoItemNo", "PrId", "PrItemId", "Quantity", "CreatedAt", "CreatedBy"],
};

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title)" });
const tabs = new Set((meta.data.sheets ?? []).map((s) => s.properties.title));
const missingTabs = Object.keys(NEW_TABS).filter((title) => !tabs.has(title));

// Existing tabs must carry the expected headers; empty trailing header cells are new columns to add.
const headerMismatches = [];
const missingHeaders = [];
for (const title of Object.keys(NEW_TABS).filter((t) => tabs.has(t))) {
  const row = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!1:1` })).data.values?.[0] ?? [];
  const expected = NEW_TABS[title];
  if (expected.some((h, i) => (row[i] ?? "") !== "" && row[i] !== h)) { headerMismatches.push({ title, found: row }); continue; }
  const firstMissing = expected.findIndex((_, i) => (row[i] ?? "") === "");
  if (firstMissing < 0) continue;
  if (expected.slice(firstMissing).some((_, j) => (row[firstMissing + j] ?? "") !== "")) { headerMismatches.push({ title, found: row }); continue; }
  missingHeaders.push({ title, fromColumn: firstMissing + 1, headers: expected.slice(firstMissing) });
}

console.log(JSON.stringify({ mode: APPLY ? "apply" : "audit-only", missingTabs, missingHeaders, headerMismatches }, null, 2));
if (headerMismatches.length) {
  console.error("Stopped: an existing purchase request tab has unexpected headers. Resolve by hand first.");
  process.exit(2);
}
if (!missingTabs.length && !missingHeaders.length) { console.log("Nothing to do."); process.exit(0); }
if (!APPLY) process.exit(0);

const columnLetter = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
if (missingHeaders.length) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: missingHeaders.map(({ title, fromColumn, headers }) => ({ range: `${title}!${columnLetter(fromColumn)}1`, values: [headers] })) },
  });
  console.log(`Added headers: ${missingHeaders.map((m) => `${m.title} (${m.headers.join(", ")})`).join("; ")}`);
}
if (!missingTabs.length) process.exit(0);

await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missingTabs.map((title) => ({ addSheet: { properties: { title, gridProperties: { columnCount: Math.max(26, NEW_TABS[title].length) } } } })) } });
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: { valueInputOption: "RAW", data: missingTabs.map((title) => ({ range: `${title}!A1`, values: [NEW_TABS[title]] })) },
});
console.log(`Created: ${missingTabs.join(", ")}`);

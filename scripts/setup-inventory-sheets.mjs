// Inventory sheet setup. Audit by default; `--apply` creates missing tabs and header cells.
//   npm run setup:inventory            (report only)
//   npm run setup:inventory -- --apply (create)
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
  StockMovements: ["MovementId", "Date", "WarehouseId", "ProductId", "Qty", "Type", "SourceType", "SourceId", "ReferenceNo", "Note", "Status", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt"],
  StockTransfers: ["TransferId", "TransferNo", "Date", "FromWarehouseId", "ToWarehouseId", "Status", "PreparedBy", "Note", "ApprovedBy", "ApprovedAt", "ApprovalNote", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt"],
  StockTransferItems: ["TransferId", "ProductId", "Qty", "SerialNumbers"],
  SafetyStock: ["WarehouseId", "ProductId", "Qty", "UpdatedBy", "UpdatedAt"],
};
// New header cells on existing tabs: [range, expected header].
const NEW_COLUMNS = [
  ["ProductCategories!F1", "TrackInventory"],
  ["DeliveryReceipts!T1", "WarehouseId"],
  ["DeliveryReceipts!U1", "ApprovedBy"],
  ["DeliveryReceipts!V1", "ApprovedAt"],
  ["DeliveryReceipts!W1", "ApprovalNote"],
  ["DeliveryReceipts!X1", "RequestedStatus"],
];

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,gridProperties)" });
const tabs = new Map((meta.data.sheets ?? []).map((s) => [s.properties.title, s.properties.gridProperties]));

const missingTabs = Object.keys(NEW_TABS).filter((title) => !tabs.has(title));
const columnStatus = [];
for (const [range, header] of NEW_COLUMNS) {
  const tab = range.split("!")[0];
  if (!tabs.has(tab)) { columnStatus.push({ range, header, state: "tab missing" }); continue; }
  // A cell beyond the sheet's current width is simply missing (apply widens the sheet).
  const value = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    .then((r) => r.data.values?.[0]?.[0] ?? "")
    .catch((error) => { if (/exceeds grid limits/i.test(String(error?.message))) return ""; throw error; });
  columnStatus.push({ range, header, state: value === header ? "ok" : value ? `occupied by "${value}"` : "missing" });
}
const narrowTabs = ["DeliveryReceipts", "ProductCategories"].filter((t) => tabs.has(t)).map((t) => ({ tab: t, columnCount: tabs.get(t).columnCount }));

console.log(JSON.stringify({ mode: APPLY ? "apply" : "audit-only", missingTabs, columns: columnStatus, columnCounts: narrowTabs }, null, 2));

const conflicts = columnStatus.filter((c) => c.state.startsWith("occupied") || c.state === "tab missing");
if (conflicts.length) {
  console.error("Stopped: one or more target header cells are occupied or their tab is missing. Resolve these by hand first.");
  process.exit(2);
}
if (!APPLY) process.exit(0);

const requests = missingTabs.map((title) => ({ addSheet: { properties: { title } } }));
// Widen existing tabs that are narrower than the new columns need.
const neededColumns = { DeliveryReceipts: 24, ProductCategories: 6 };
for (const { tab, columnCount } of narrowTabs) {
  if (columnCount < neededColumns[tab]) {
    const sheetId = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === tab).properties.sheetId;
    requests.push({ appendDimension: { sheetId, dimension: "COLUMNS", length: neededColumns[tab] - columnCount } });
  }
}
if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: {
    valueInputOption: "RAW",
    data: [
      ...missingTabs.map((title) => ({ range: `${title}!A1`, values: [NEW_TABS[title]] })),
      ...columnStatus.filter((c) => c.state === "missing").map((c) => ({ range: c.range, values: [[c.header]] })),
    ],
  },
});
console.log("Inventory sheets are ready.");

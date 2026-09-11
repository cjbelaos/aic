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
  throw new Error("Configure service-account credentials before running the migration.");
}

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const read = async (range) => (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
const norm = (value) => String(value ?? "").trim().toLowerCase();
const status = (value) => norm(value) === "inactive" ? "Inactive" : "Active";
const headers = ["ContractItemId", "ContractId", "ProductId", "ProductCodeSnapshot", "EntitledQty", "Frequency", "Status"];

const [legacyRows, v2Rows, productRows] = await Promise.all([read("ContractItems!A2:F"), read("ContractItemsV2!A2:G"), read("ProductsV2!A2:B")]);
const productIdByCode = new Map(productRows.map((row) => [norm(row[1]), String(row[0] ?? "").trim()]));
const issues = [];
const canonicalById = new Map();

for (const [index, row] of v2Rows.entries()) {
  const id = String(row[0] ?? "").trim(); if (!id) continue;
  if (canonicalById.has(id)) issues.push({ sheet: "ContractItemsV2", row: index + 2, id, issue: "Duplicate ContractItemId" });
  canonicalById.set(id, [id, String(row[1] ?? "").trim(), String(row[2] ?? "").trim(), String(row[3] ?? "").trim(), Number(row[4]) || 0, String(row[5] ?? "Monthly"), status(row[6])]);
}

for (const [index, row] of legacyRows.entries()) {
  const id = String(row[0] ?? "").trim(); if (!id) continue;
  const productCode = String(row[2] ?? "").trim();
  const migrated = [id, String(row[1] ?? "").trim(), productIdByCode.get(norm(productCode)) ?? "", productCode, Number(row[3]) || 0, String(row[4] ?? "Monthly"), status(row[5])];
  if (!migrated[2]) issues.push({ sheet: "ContractItems", row: index + 2, id, issue: `No ProductsV2 match for product code ${productCode}` });
  const existing = canonicalById.get(id);
  if (existing) {
    if (![1, 3, 4, 5, 6].every((column) => norm(existing[column]) === norm(migrated[column]))) issues.push({ sheet: "ContractItems", row: index + 2, id, issue: "Conflicts with the ContractItemsV2 row" });
  } else canonicalById.set(id, migrated);
}

const canonicalRows = [...canonicalById.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }));
console.log(JSON.stringify({ mode: APPLY ? "apply" : "audit-only", legacyRows: legacyRows.length, v2Rows: v2Rows.length, mergedRows: canonicalRows.length, issueCount: issues.length, issues }, null, 2));
if (!APPLY) process.exit(issues.length ? 2 : 0);
if (issues.length) throw new Error("Migration stopped because the audit found conflicts or unresolved products.");

await sheets.spreadsheets.values.clear({ spreadsheetId, range: "ContractItems!A:G" });
await sheets.spreadsheets.values.update({ spreadsheetId, range: "ContractItems!A1:G", valueInputOption: "USER_ENTERED", requestBody: { values: [headers, ...canonicalRows] } });
const written = await read("ContractItems!A1:G");
const expected = [headers, ...canonicalRows].map((row) => row.map(String));
if (JSON.stringify(written) !== JSON.stringify(expected)) throw new Error("ContractItems verification failed; ContractItemsV2 was retained.");

const metadata = await sheets.spreadsheets.get({ spreadsheetId });
const v2SheetId = metadata.data.sheets?.find((sheet) => sheet.properties?.title === "ContractItemsV2")?.properties?.sheetId;
if (v2SheetId == null) throw new Error("ContractItems was migrated, but ContractItemsV2 could not be found for removal.");
await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId: v2SheetId } }] } });
console.log(JSON.stringify({ ok: true, migratedRows: canonicalRows.length, removedSheet: "ContractItemsV2" }, null, 2));

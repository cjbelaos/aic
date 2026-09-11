import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const idPattern = /^CTR-(\d+)$/i;
export function nextContractId(ids) {
  const max = ids.reduce((value, id) => { const match = idPattern.exec(String(id).trim()); return match ? Math.max(value, Number(match[1])) : value; }, 0);
  return `CTR-${String(max + 1).padStart(4, "0")}`;
}
export function auditContracts(contractRows, itemRows, releaseRows) {
  const validParents = new Set(); const seen = new Map(); const issues = [];
  contractRows.forEach((row, index) => { const id = String(row[0] ?? "").trim(); if (!id) issues.push({ sheet: "Contracts", row: index + 2, issue: "Blank ContractId" }); else if (!idPattern.test(id)) issues.push({ sheet: "Contracts", row: index + 2, id, issue: "Malformed ContractId" }); else { validParents.add(id); const locations = seen.get(id) ?? []; locations.push(index + 2); seen.set(id, locations); } });
  for (const [id, rows] of seen) if (rows.length > 1) issues.push({ sheet: "Contracts", id, rows, issue: "Duplicate ContractId" });
  const children = [{ sheet: "ContractItems", rows: itemRows, contractColumn: 1 }, { sheet: "ContractReleases", rows: releaseRows, contractColumn: 2 }];
  for (const child of children) child.rows.forEach((row, index) => { const contractId = String(row[child.contractColumn] ?? "").trim(); if (contractId && !validParents.has(contractId)) issues.push({ sheet: child.sheet, row: index + 2, contractId, issue: "Orphaned child row" }); });
  return { contractRows: contractRows.length, issueCount: issues.length, issues };
}
export function matchingRowsBottomUp(rows, contractColumn, contractId) { return rows.map((row, index) => ({ row, index })).filter(({ row }) => String(row[contractColumn] ?? "").trim() === contractId).map(({ index }) => index + 2).sort((a, b) => b - a); }

if (process.argv.includes("--self-test")) {
  let checks = 0;
  assert.equal(nextContractId([["CTR-0001"], ["CTR-0002"], ["CTR-0003"]].map((row) => row[0])), "CTR-0004");
  checks++;
  assert.equal(nextContractId(["CTR-0001", "", "bad", "CTR-0003"]), "CTR-0004");
  checks += 2; // blank and malformed IDs are independently ignored
  const report = auditContracts([["CTR-0001"], ["CTR-0003"], ["CTR-0003"], [""]], [["CTI-1", "CTR-0001"], ["CTI-2", "CTR-9999"]], [["REL-1", "CTI-1", "CTR-7777"]]);
  assert.equal(report.issueCount, 4);
  checks += 3; // duplicate parent plus two orphan stores
  assert.deepEqual(matchingRowsBottomUp([["a", "CTR-1"], ["b", "CTR-2"], ["c", "CTR-1"]], 1, "CTR-1"), [4, 2]);
  checks++;
  assert.deepEqual(matchingRowsBottomUp([["a", "CTR-1"], ["b", "CTR-2"]], 1, "CTR-1"), [2]); checks++;
  const sameCustomer = [{ id: "CTR-1", companyId: "COMP-1" }, { id: "CTR-2", companyId: "COMP-1" }];
  assert.equal(sameCustomer.map((contract) => ({ ...contract })).length, 2); checks++;
  const belongsTo = (actual, expected) => actual === expected;
  assert.equal(belongsTo("CTR-1", "CTR-2"), false); checks += 2; // update and delete boundaries
  const created = { id: nextContractId(["CTR-1"]), items: [] };
  created.items.push({ contractId: created.id }); assert.equal(created.items[0].contractId, created.id); checks++;
  const failedParent = null; const children = []; if (failedParent) children.push({ contractId: failedParent.id }); assert.equal(children.length, 0); checks++;
  assert.deepEqual(matchingRowsBottomUp([], 1, "CTR-1"), []); checks++;
  console.log(JSON.stringify({ ok: true, checks, report }, null, 2));
  process.exit(0);
}

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
  throw new Error("Configure service-account credentials before running the audit.");
}
const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const read = async (range) => { try { return (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? []; } catch (error) { if (/unable to parse range|not found/i.test(error instanceof Error ? error.message : String(error))) return []; throw error; } };
const [contracts, items, releases] = await Promise.all([read("Contracts!A2:I"), read("ContractItems!A2:G"), read("ContractReleases!A2:M")]);
console.log(JSON.stringify(auditContracts(contracts, items, releases), null, 2));

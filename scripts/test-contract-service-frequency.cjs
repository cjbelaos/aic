/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server tests with in-memory Sheets. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)(id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith("@/") ? {} : id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : `${id}.ts`), mocks) : require(id), mod, mod.exports);
  return mod.exports;
}
async function main() {
  let rows = [["CTR-0001", "COMP-1", "", "Contract", "", "2026-01-01", "2026-12-31", "Active", 20000, "Notes", "soft-link", "signed-link"]];
  const writes = [];
  const sheets = { spreadsheets: { values: {
    get: async ({ range }) => ({ data: { values: range === "Contracts!A2:A" ? rows.map(row => [row[0]]) : rows } }),
    append: async request => { rows.push(request.requestBody.values[0]); },
    update: async request => {
      writes.push(request.range);
      const match = /!([A-Z]+)(\d+)/.exec(request.range);
      const start = match[1].charCodeAt(0) - 65;
      request.requestBody.values[0].forEach((value, index) => { rows[Number(match[2]) - 2][start + index] = value; });
    },
  } } };
  const storage = load("src/lib/contractSheets.ts", {
    "@/lib/googleSheets": { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => "fixture" },
    "@/lib/contractIntegrity": load("src/lib/contractIntegrity.ts"),
  });
  assert.equal((await storage.getContracts())[0].serviceFeeFrequency, "Monthly", "Legacy rows default to monthly");
  await storage.updateContractInSheets({ id: "CTR-0001", serviceFeeFrequency: "Quarterly" });
  assert.equal((await storage.getContracts())[0].serviceFeeFrequency, "Quarterly");
  assert.deepEqual(rows[0].slice(9, 12), ["Notes", "soft-link", "signed-link"], "Frequency updates preserve notes and documents");
  await storage.updateContractInSheets({ id: "CTR-0001", description: "Updated" });
  assert.equal((await storage.getContracts())[0].serviceFeeFrequency, "Quarterly", "Unrelated updates preserve frequency");
  const created = await storage.addContract({ companyId: "COMP-1", agreementType: "Contract", startDate: "2026-01-01", endDate: "2026-12-31", status: "Active", monthlyServiceFee: 20000, serviceFeeFrequency: "Quarterly" });
  assert.equal(created.serviceFeeFrequency, "Quarterly");
  assert.equal((await storage.getContracts())[1].serviceFeeFrequency, "Quarterly", "Creation persists frequency through a fresh read");
  await storage.updateContractInSheets({ id: created.id, serviceFeeFrequency: "Monthly" });
  assert.equal((await storage.getContracts())[1].serviceFeeFrequency, "Monthly");
  console.log("Contract service frequency tests passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

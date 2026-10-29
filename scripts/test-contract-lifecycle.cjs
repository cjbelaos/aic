/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript domain and API tests. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : `${id}.ts`), mocks) : require(id), mod, mod.exports);
  return mod.exports;
}
async function main() {
  const { effectiveContractStatus, manilaToday, contractRowClass } = load("src/lib/contractStatus.ts");
  const contract = { status: "Active", endDate: "2026-10-21", paperworkStatus: "Pending" };
  assert.equal(manilaToday(new Date("2026-10-21T15:59:59Z")), "2026-10-21");
  assert.equal(manilaToday(new Date("2026-10-21T16:00:00Z")), "2026-10-22");
  assert.equal(effectiveContractStatus(contract, "2026-10-21"), "Active");
  assert.equal(effectiveContractStatus(contract, "2026-10-22"), "Expired");
  for (const status of ["Closed", "Inactive", "Expired"]) assert.equal(effectiveContractStatus({ ...contract, status }, "2026-10-22"), status);
  assert.equal(effectiveContractStatus({ ...contract, endDate: "" }), "Active");
  assert.match(contractRowClass({ ...contract, endDate: "9999-12-31" }), /amber/);
  assert.match(contractRowClass({ ...contract, endDate: "9999-12-31", paperworkStatus: "Complete" }), /green/);
  assert.match(contractRowClass({ ...contract, endDate: "2000-01-01" }), /red/);
  for (const status of ["Closed", "Inactive"]) assert.equal(contractRowClass({ ...contract, status }), "");

  const { quarterlyBillingPeriod: period } = load("src/lib/contractBillingPeriod.ts");
  assert.deepEqual(period("2026-02-15", "2026-02-15"), { start: "2026-02-15", end: "2026-05-14" });
  assert.deepEqual(period("2026-02-15", "2026-05-14"), { start: "2026-02-15", end: "2026-05-14" });
  assert.deepEqual(period("2026-02-15", "2026-05-15"), { start: "2026-05-15", end: "2026-08-14" });
  assert.deepEqual(period("2026-01-31", "2026-04-30"), { start: "2026-04-30", end: "2026-07-30" });
  assert.deepEqual(period("2026-01-31", "2026-07-31"), { start: "2026-07-31", end: "2026-10-30" });
  assert.deepEqual(period("2023-11-30", "2024-02-29"), { start: "2024-02-29", end: "2024-05-29" });
  assert.deepEqual(period("2024-02-29", "2025-02-28"), { start: "2025-02-28", end: "2025-05-28" });
  assert.throws(() => period("2026-02-15", "2026-02-14"), /precede/);
  assert.throws(() => period("2026-02-30", "2026-03-01"), /valid/);
  assert.throws(() => period("", "2026-03-01"), /valid/);

  const billing = load("src/lib/serviceInvoiceBilling.ts");
  const quarterly = { ...contract, id: "CTR-1", companyId: "COMP-1", startDate: "2026-02-15", serviceFeeFrequency: "Quarterly", monthlyServiceFee: 3000 };
  const item = billing.pmsInvoiceItem("2026-05-15", 3000, "Quarterly", quarterly.startDate);
  assert.equal(item.unitPrice, 3000);
  const input = { date: "2026-05-15", billingMode: "PMS_CONTRACT", contractId: "CTR-1", customerId: "COMP-1", items: [item] };
  assert.equal(billing.validateInvoiceBilling(input, quarterly).contractId, "CTR-1", "Pending paperwork allows billing");
  assert.throws(() => billing.validateInvoiceBilling({ ...input, date: "2026-08-15" }, quarterly), /billing period/);
  assert.equal(billing.validateInvoiceBilling({ ...input, items: [{ ...item, description: "PMS FOR THE QUARTER OF Q2 2026" }] }, quarterly, true).contractId, "CTR-1", "Historical invoice descriptions remain editable");

  let writes = 0;
  const mocks = {
    "@/lib/contractNoteSheets": require("./proforma-runtime.cjs").createLoader({ "@/lib/googleSheets": {} })("src/lib/contractNoteSheets.ts"),
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/auth/session": { requireAuthenticatedSession: async () => ({}) },
    "@/lib/contractSheets": { addContract: async body => { writes++; return body; }, updateContractInSheets: async body => { writes++; return body; } },
    "@/lib/companySheets": { getCustomers: async () => [{ companyId: "COMP-1" }] },
  };
  const create = load("src/app/api/contracts/route.ts", mocks).POST;
  const update = load("src/app/api/contracts/[id]/route.ts", mocks).PUT;
  const request = body => new Request("http://localhost/api/contracts", { method: "POST", body: JSON.stringify(body) });
  const base = { companyId: "COMP-1", agreementType: "Contract", startDate: "2026-02-15", endDate: "2027-02-14" };
  for (const invalid of [{ paperworkStatus: "Other" }, { notarizedHardcopyStatus: "Maybe" }]) {
    assert.equal((await create(request({ ...base, ...invalid }))).status, 400);
    assert.equal((await update(request(invalid), { params: Promise.resolve({ id: "CTR-1" }) })).status, 400);
  }
  assert.equal(writes, 0, "Invalid metadata never reaches storage");
  assert.equal((await create(request({ ...base, paperworkStatus: "Pending", notarizedHardcopyStatus: "Unknown" }))).status, 201);
  assert.equal((await update(request({ paperworkStatus: "Complete", notarizedHardcopyStatus: "Yes" }), { params: Promise.resolve({ id: "CTR-1" }) })).status, 200);
  console.log("PASS contract expiry, colors, quarterly boundaries, pending billing, historical invoices, and API metadata validation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

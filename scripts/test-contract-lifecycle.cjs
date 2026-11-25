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
  const { isContinuous, paperworkPending } = load("src/lib/contractStatus.ts");
  const cont = { status: "Active", endDate: "", paperworkStatus: "Pending", agreementType: "Continuous" };
  assert.equal(isContinuous(cont), true);
  assert.equal(effectiveContractStatus(cont, "2099-01-01"), "Active");
  assert.equal(effectiveContractStatus({ ...cont, status: "Expired" }, "2026-11-25"), "Expired", "A stored Expired Continuous contract is not revived");
  assert.equal(paperworkPending(cont, "2026-11-25"), false);
  assert.equal(paperworkPending({ ...cont, agreementType: "Contract", endDate: "2099-01-01" }, "2026-11-25"), true);
  assert.match(contractRowClass(cont), /green/);
  assert.equal(effectiveContractStatus({ ...cont, endDate: "2000-01-01" }, "2026-11-25"), "Active", "A leftover end date never expires a Continuous contract");

  const { quarterlyBillingPeriod: period } = load("src/lib/contractBillingPeriod.ts");
  assert.deepEqual(period("2026-02-15", "2026-02-15"), { start: "2026-02", end: "2026-04" });
  assert.deepEqual(period("2026-02", "2026-04-30"), { start: "2026-02", end: "2026-04" });
  assert.deepEqual(period("2026-02", "2026-05-01"), { start: "2026-05", end: "2026-07" });
  assert.deepEqual(period("2026-08", "2026-11-22"), { start: "2026-11", end: "2027-01" });
  assert.deepEqual(period("2026-11", "2027-02-28"), { start: "2027-02", end: "2027-04" });
  assert.throws(() => period("2026-02", "2026-01-31"), /precede/);
  assert.throws(() => period("2026-02", "2026-02-30"), /valid/);
  assert.throws(() => period("", "2026-03-01"), /valid/);
  const { toPmsCycleStart, pmsCycleAnchor } = load("src/lib/contractBillingPeriod.ts");
  for (const raw of ["2026-08", "2026-08-01", "8/1/2026", " 8/23/2026 "]) assert.equal(toPmsCycleStart(raw), "2026-08", raw);
  for (const raw of ["", "Aug", "2026-13", undefined]) assert.equal(toPmsCycleStart(raw), undefined);
  assert.equal(pmsCycleAnchor({ startDate: "2026-04-27", pmsCycleStart: "2026-08" }), "2026-08");
  assert.equal(pmsCycleAnchor({ startDate: "2026-04-27" }), "2026-04");

  const billing = load("src/lib/serviceInvoiceBilling.ts");
  const quarterly = { ...contract, id: "CTR-1", companyId: "COMP-1", startDate: "2026-02-15", serviceFeeFrequency: "Quarterly", monthlyServiceFee: 3000 };
  const item = billing.pmsInvoiceItem("2026-05-15", 3000, "Quarterly", "2026-02");
  assert.equal(item.unitPrice, 3000);
  const input = { date: "2026-05-15", billingMode: "PMS_CONTRACT", contractId: "CTR-1", customerId: "COMP-1", items: [item] };
  assert.equal(billing.validateInvoiceBilling(input, quarterly).contractId, "CTR-1", "Pending paperwork allows billing");
  assert.throws(() => billing.validateInvoiceBilling({ ...input, date: "2026-08-15" }, quarterly), /billing period/);
  assert.equal(billing.validateInvoiceBilling({ ...input, items: [{ ...item, description: "PMS FOR THE QUARTER OF Q2 2026" }] }, quarterly, true).contractId, "CTR-1", "Historical invoice descriptions remain editable");

  let writes = 0;
  let saved, added;
  const mocks = {
    "@/lib/contractNoteSheets": require("./proforma-runtime.cjs").createLoader({ "@/lib/googleSheets": {} })("src/lib/contractNoteSheets.ts"),
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/auth/session": { requireAuthenticatedSession: async () => ({}) },
    "@/lib/contractSheets": { addContract: async body => { writes++; added = body; return body; }, updateContractInSheets: async body => { writes++; saved = body; return body; } },
    "@/lib/companySheets": { getCustomers: async () => [{ companyId: "COMP-1" }] },
    "@/lib/contractBillingPeriod": load("src/lib/contractBillingPeriod.ts"),
  };
  const create = load("src/app/api/contracts/route.ts", mocks).POST;
  const update = load("src/app/api/contracts/[id]/route.ts", mocks).PUT;
  const request = body => new Request("http://localhost/api/contracts", { method: "POST", body: JSON.stringify(body) });
  const base = { companyId: "COMP-1", agreementType: "Contract", startDate: "2026-02-15", endDate: "2027-02-14" };
  for (const invalid of [{ paperworkStatus: "Other" }, { notarizedHardcopyStatus: "Maybe" }, { pmsCycleStart: "Aug 2026" }]) {
    assert.equal((await create(request({ ...base, ...invalid }))).status, 400);
    assert.equal((await update(request(invalid), { params: Promise.resolve({ id: "CTR-1" }) })).status, 400);
  }
  assert.equal(writes, 0, "Invalid metadata never reaches storage");
  assert.equal((await create(request({ ...base, paperworkStatus: "Pending", notarizedHardcopyStatus: "Unknown" }))).status, 201);
  assert.equal((await update(request({ paperworkStatus: "Complete", notarizedHardcopyStatus: "Yes" }), { params: Promise.resolve({ id: "CTR-1" }) })).status, 200);
  const put = body => update(request(body), { params: Promise.resolve({ id: "CTR-1" }) });
  assert.equal((await create(request({ ...base, endDate: "" }))).status, 400, "Contract still needs an end date");
  assert.equal((await create(request({ ...base, agreementType: "Lease" }))).status, 400);
  assert.equal((await put({ agreementType: "Lease" })).status, 400);
  assert.equal((await put({ agreementType: "Contract", endDate: "" })).status, 400, "Leaving Continuous needs an end date");
  assert.equal((await create(request({ ...base, agreementType: "Continuous", endDate: "" }))).status, 201);
  assert.equal((await create(request({ ...base, agreementType: "Continuous", endDate: "2027-01-01" }))).status, 201);
  assert.equal(added.endDate, "", "Continuous creates with a blank end date");
  assert.equal((await put({ agreementType: "Continuous", endDate: "2027-01-01" })).status, 200);
  assert.equal(saved.endDate, "", "Continuous saves a blank end date");
  console.log("PASS contract expiry, colors, quarterly boundaries, pending billing, historical invoices, and API metadata validation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

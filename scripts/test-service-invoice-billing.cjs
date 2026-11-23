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
  const billing = load("src/lib/serviceInvoiceBilling.ts");
  const filters = load("src/lib/serviceInvoiceFilters.ts");
  const contract = { id: "CTR-0010", companyId: "COMP-284", status: "Active", monthlyServiceFee: 23000 };
  const release = { drNumber: 3856, contractId: contract.id, status: "Completed" };
  const resolve = (releases, contracts = [contract], customerId = contract.companyId) => billing.pmsContractForDelivery(3856, customerId, releases, contracts);
  assert.equal(resolve([release]), contract, "DR prefill selects its originating PMS contract");
  assert.equal(resolve([release, release]), contract, "Multiple released items from one contract are unambiguous");
  assert.equal(resolve([]), undefined, "Regular receipts do not infer a contract from the customer");
  assert.equal(resolve([{ ...release, drNumber: 1 }]), undefined);
  assert.equal(resolve([{ ...release, status: "Cancelled" }]), undefined);
  assert.equal(resolve([{ ...release, status: "Deleted" }]), undefined);
  assert.equal(resolve([release], [contract], "other"), undefined);
  assert.equal(resolve([release], [{ ...contract, status: "Expired" }]), undefined);
  assert.equal(resolve([release], [{ ...contract, monthlyServiceFee: 0 }]), undefined);
  assert.equal(resolve([release, { ...release, contractId: "CTR-OTHER" }], [contract, { ...contract, id: "CTR-OTHER" }]), undefined, "Do not guess for multiple source contracts of the same customer");
  assert.equal(resolve([release, { ...release, contractId: "CTR-TANAY" }], [contract, { ...contract, id: "CTR-TANAY", companyId: "COMP-TANAY" }]), contract, "Another customer's item riding on the DR is ignored");
  const regular = { customerId: "COMP-284", billingMode: "REGULAR", manualCategories: ["Service"], items: [{ description: "SEMI AUTO REPROCESSING MACHINE BASIC PMS", quantity: 1, unitPrice: 4500 }] };
  const pms = { ...regular, billingMode: "PMS_CONTRACT", manualCategories: [], contractId: contract.id, items: [billing.pmsInvoiceItem("2026-10-08", 23000)] };
  assert.deepEqual(billing.validateInvoiceBilling(regular, contract), { billingMode: "REGULAR", contractId: "", manualCategories: ["Service"] });
  assert.equal(billing.validateInvoiceBilling({ ...regular, items: [{ ...regular.items[0], unitPrice: 23000 }] }, contract).billingMode, "REGULAR", "Matching a fee does not make an invoice PMS");
  assert.equal(billing.validateInvoiceBilling(pms, contract).contractId, contract.id);
  assert.equal(billing.validateInvoiceBilling({ ...pms, drNumber: 3856 }, contract).billingMode, "PMS_CONTRACT", "Monthly PMS can retain its delivery receipt");
  assert.equal(pms.items[0].description, "PMS FOR THE MONTH OF OCTOBER 2026");
  const quarterlyContract = { ...contract, serviceFeeFrequency: "Quarterly" };
  const quarterlyItem = billing.pmsInvoiceItem("2026-10-08", 17000, "Quarterly", "2026-02");
  assert.equal(quarterlyItem.description, "PMS FOR THE QUARTER OF AUGUST 2026 TO OCTOBER 2026");
  const tanay = { ...contract, serviceFeeFrequency: "Quarterly", startDate: "2026-04-27", pmsCycleStart: "2026-08" };
  const tanayItem = { description: "PMS FOR THE QUARTER OF NOVEMBER 2026 TO JANUARY 2027", quantity: 1, unitPrice: 15000 };
  assert.equal(billing.validateInvoiceBilling({ ...pms, date: "2026-11-22", items: [tanayItem] }, tanay).contractId, contract.id, "PMS cycle start overrides the MOA date");
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, date: "2026-11-22", items: [tanayItem] }, { ...tanay, pmsCycleStart: undefined }), /billing period/, "MOA-anchored quarter is OCTOBER TO DECEMBER");
  assert.equal(quarterlyItem.unitPrice, 17000, "Quarterly fee is charged as entered");
  assert.equal(billing.validateInvoiceBilling({ ...pms, date: "2026-10-08", items: [quarterlyItem] }, { ...quarterlyContract, startDate: "2026-02-15" }).contractId, contract.id);
  assert.throws(() => billing.validateInvoiceBilling(pms, quarterlyContract), /matching the contract frequency/);
  assert.equal(billing.validateInvoiceBilling(pms, quarterlyContract, true).contractId, contract.id, "Issued monthly invoices remain editable after correcting the contract to quarterly");
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, items: [quarterlyItem] }, contract), /matching the contract frequency/);

  assert.throws(() => billing.validateInvoiceBilling({ ...regular, contractId: contract.id }, contract), /Choose PMS contract billing/);
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, billingMode: undefined }, contract), /Choose PMS contract billing/, "Old clients must not silently attach a contract");
  assert.throws(() => billing.validateInvoiceBilling({ ...regular, manualCategories: [] }), /Select an invoice category/);
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, contractId: "missing" }, contract), /Select a PMS contract/);
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, customerId: "other" }, contract), /different customer/);
  assert.throws(() => billing.validateInvoiceBilling(pms, { ...contract, status: "Expired" }), /active PMS contract/);
  assert.equal(billing.validateInvoiceBilling(pms, { ...contract, status: "Expired" }, true).contractId, contract.id);
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, items: [...pms.items, regular.items[0]] }, contract), /one PMS charge/);
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, items: regular.items }, contract), /one PMS charge/);
  assert.throws(() => billing.validateInvoiceBilling({ ...pms, salesOrderId: "SO-1" }, contract), /separate invoice/);
  assert.throws(() => filters.validateManualCategories(["PMS", "Service"]), /separate invoices/);
  assert.throws(() => billing.validateInvoiceBilling({ ...regular, items: [...pms.items, ...regular.items] }), /separate invoice/);
  assert.equal(billing.validateInvoiceBilling({ ...regular, manualCategories: [], salesOrderId: "SO-1" }).manualCategories.length, 0);
  assert.equal(filters.categoryForInvoice({ contractId: "CTR-0010" }, new Map(), new Map()), "PMS");
  assert.equal(filters.categoryForInvoice({ manualCategories: ["Service"] }, new Map(), new Map()), "Service");

  let row = Array(21).fill("");
  row[0] = "1721"; row[1] = "2026-10-08"; row[2] = regular.customerId; row[8] = "created";
  row[10] = contract.id; row[12] = "tech"; row[19] = JSON.stringify({ custom: "preserved", paymentStatus: "unpaid" }); row[20] = "TR_NUMBER";
  let writes = [];
  const headers = ["InvoiceNo", "Date", "CustomerId", "PreparedBy", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt", "Status", "DriveFileLink", "ContractId", "DRNo", "AssignedTechnicianUserId", "AssignedTechnicianName", "ServiceReportId", "ServiceReportStatus", "PONumber", "TRNumber", "SalesOrderId", "ManualCompletionData", "ReferenceMode"];
  const stop = new Error("STOP_AFTER_HEADER_WRITE");
  const sheets = { spreadsheets: { values: {
    get: async ({ range }) => ({ data: { values: range === "ServiceInvoices!A2:A" ? [[row[0]]] : range === "ServiceInvoices!A1:U1" ? [headers] : range.startsWith("ServiceInvoiceItems!") ? [[row[0], regular.items[0].description, 1, 4500, 4500]] : [row] } }),
    append: async request => { writes.push(request.requestBody.values[0]); throw stop; },
    update: async request => { writes.push(request.requestBody.values[0]); throw stop; },
  } } };
  const storage = load("src/lib/serviceInvoiceSheets.ts", {
    "@/lib/documentHandoverCommit": { commitDocumentWithHandover: async source => { writes.push(source.row); throw stop; } },
    "@/lib/googleSheets": { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => "fixture" },
    "@/lib/companySheets": { getCompanies: async () => [{ companyId: regular.customerId, companyName: "TAGAYTAY MEDICAL CENTER" }, { companyId: "COMP-122", companyName: "HOLY FAMILY" }], getCustomers: async () => [{ companyId: regular.customerId, companyName: "TAGAYTAY MEDICAL CENTER" }] },
    "@/lib/deliverySheets": { getDeliveryReceipts: async () => [{ drNumber: 3941, companyId: "COMP-336", companyName: "HEMOTEK CABANATUAN" }, { drNumber: 4096, companyId: regular.customerId, companyName: "TAGAYTAY MEDICAL CENTER", forCompanyId: "COMP-122" }], resolveDeliveryReceiptReferences: async drNumber => drNumber === 4096 ? { poNo: "", trNo: "" } : ({ salesOrderId: "SO-TEST", poNo: "PO", trNo: "SO" }), resolveDeliveryReceiptDeliveredBy: async () => ({ deliveredById: "tech", deliveredByName: "Technician" }) },
    "@/lib/salesOrders/service": { getOrderDetail: async () => ({ order: { customerId: "COMP-336", salesOrderNo: "SO-1", billingType: "SERVICE_INVOICE" }, items: [], category: "Service", totals: { grandTotal: 1000000 } }) },
    "@/lib/userSheets": { getUserById: async id => ({ userId: id, fullName: "Technician" }) },
    "@/lib/contractSheets": { getContracts: async () => [contract] },
    "@/lib/serviceInvoiceBilling": billing,
    "@/lib/serviceInvoiceFilters": filters,
    "./serviceInvoiceDiscounts": { resolveInvoiceDiscount: () => undefined, hydrateInvoiceDiscount: () => {}, invoiceDiscountSnapshot: () => undefined, invoiceTotals: load("src/lib/serviceInvoiceDiscounts.ts").invoiceTotals },
  });
  const originalError = console.error;
  console.error = () => {}; // Expected validation errors and write sentinels.
  try {
    const create = { ...regular, invoiceNo: "1722", date: row[1], preparedBy: "Tester", referenceMode: "TR_NUMBER", assignedTechnicianUserId: "tech" };
    for (const status of ["draft", "created"]) {
      writes = [];
      await assert.rejects(storage.processServiceInvoice({ ...create, status, manualCategories: [] }, "tester"), /Select an invoice category/);
      assert.equal(writes.length, 0);
      await assert.rejects(storage.processServiceInvoice({ ...create, status }, "tester"), error => error === stop);
      assert.equal(writes[0][10], "");
      assert.deepEqual(JSON.parse(writes[0][19]).manualCategories, ["Service"]);
      writes = [];
      await assert.rejects(storage.processServiceInvoice({ ...create, ...pms, status }, "tester"), error => error === stop);
      assert.equal(writes[0][10], contract.id);
      assert.equal(JSON.parse(writes[0][19]).billingMode, "PMS_CONTRACT");
    }
    writes = [];
    await assert.rejects(storage.updateServiceInvoice("1721", { ...regular, contractId: "", referenceMode: "TR_NUMBER" }, "tester"), error => error === stop);
    assert.equal(writes[0][10], "");
    const metadata = JSON.parse(writes[0][19]);
    assert.equal(metadata.custom, "preserved"); assert.equal(metadata.paymentStatus, "unpaid");
    assert.deepEqual(metadata.manualCategories, ["Service"]);
    assert.equal(metadata.billingHistory[0].fromContractId, contract.id);
    assert.equal(metadata.billingHistory[0].changedBy, "tester");
    writes = [];
    await assert.rejects(storage.processServiceInvoice({ ...regular, invoiceNo: "1773", date: row[1], drNumber: 3941, status: "draft" }, "tester"), error => error === stop);
    assert.equal(writes[0][2], regular.customerId, "Explicit payer override survives even when SO belongs to the service branch");
    assert.equal(JSON.parse(writes[0][19]).serviceContext.serviceCompanyId, "COMP-336");
    writes = [];
    await assert.rejects(storage.processServiceInvoice({ ...pms, invoiceNo: "1774", date: row[1], drNumber: 4096, status: "draft" }, "tester"), error => error === stop);
    assert.deepEqual(JSON.parse(writes[0][19]).serviceContext, { version: 1, serviceCompanyId: "COMP-122", serviceCompanyName: "HOLY FAMILY", drCompanyId: regular.customerId }, "A DR's FOR client is the service location; the DR company still owns the contract");
    writes = [];
    row[8] = "draft";
    await assert.rejects(storage.updateServiceInvoice("1721", { status: "created", billingMode: "REGULAR", contractId: "", manualCategories: [] }, "tester"), /Select an invoice category/);
    assert.equal(writes.length, 0, "Draft finalization validates billing before persisting");
    await assert.rejects(storage.updateServiceInvoice("1721", { ...pms, items: [...pms.items, regular.items[0]] }, "tester"), /one PMS charge/);
    assert.equal(writes.length, 0);
  } finally { console.error = originalError; }
  console.log("PASS explicit billing, category selection, PMS separation, customer/contract validation, legacy correction audit, create/draft/edit persistence and finalization guards");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

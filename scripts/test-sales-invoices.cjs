/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server tests with in-memory Sheets. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", js)(id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith("@/") ? {} : id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : `${id}.ts`), mocks) : require(id), mod, mod.exports);
  return mod.exports;
}

async function main() {
  const { invoiceTotals, resolveInvoiceDiscount } = load("src/lib/serviceInvoiceDiscounts.ts");
  const PrintDocument = load("src/components/service-invoice-print-document.tsx", { "@/lib/serviceInvoiceDiscounts": { invoiceTotals } }).default;
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  for (const kind of ["service", "sales"]) {
    const si = { success: true, invoiceKind: kind, invoiceNo: "TEST", date: "2026-10-15", companyName: "TEST CUSTOMER", address: "TEST ADDRESS", tin: "", preparedBy: "PREPARER", assignedPicName: "HIDDEN DELIVERY PIC", status: "created", items: [{ description: "TEST ITEM", quantity: 1, unitPrice: 14000 }] };
    const html = renderToStaticMarkup(React.createElement(PrintDocument, { si }));
    assert.ok(!html.includes("HIDDEN DELIVERY PIC"), "PIC is never printed");
    assert.ok(!html.includes("Sales Invoice") && !html.includes("Service Invoice"), "No printed title");
    const text = html.replace(/<[^>]+>/g, "");
    assert.ok(text.includes(kind === "sales" ? "125.00" : "250.00"), "Withholding occupies the former zero row");
    fs.mkdirSync("tmp/invoice-print-check", { recursive: true });
    fs.writeFileSync(`tmp/invoice-print-check/${kind}.html`, `<!doctype html><html><body style="margin:0;background:white">${html}</body></html>`);
  }
  const filters = load("src/lib/serviceInvoiceFilters.ts");
  const billing = load("src/lib/serviceInvoiceBilling.ts");
  const fixture = { items: [{ description: "Supply", quantity: 1, unitPrice: 14000 }] };
  for (const kind of ["service", "sales"]) {
    const result = invoiceTotals({ ...fixture, invoiceKind: kind });
    assert.equal(result.vatableSales, 12500); assert.equal(result.vat, 1500);
    assert.equal(result.lessVat, result.addVat);
    assert.equal(result.lessWithholdingTax, kind === "service" ? 250 : 125);
    assert.equal(result.totalAmountDue, 14000);
    assert.equal(result.zeroRatedSales, ""); assert.equal(result.vatExemptSales, "");
    assert.equal(result.lessDiscount, "-");
    const discounted = invoiceTotals({ ...fixture, invoiceKind: kind, discountAmount: 2800 });
    assert.equal(discounted.vatableSales, 10000);
    assert.equal(discounted.lessWithholdingTax, kind === "service" ? 200 : 100);
  }
  for (const value of [[], ["Service"], ["PMS"], ["Parts", "PMS"]]) assert.throws(() => filters.validateSalesInvoiceCategories(value));
  assert.deepEqual(filters.validateSalesInvoiceCategories(["Parts", "Project"]), ["Parts", "Project"]);
  const source = { order: { salesOrderId: "SO-1", salesOrderNo: "SO-001", customerId: "C1", version: 1, discountSettings: { mode: "OVERALL", type: "PERCENT", value: 10, basis: "VAT_INCLUSIVE", scope: "FULL_LINE" } }, items: [{ salesOrderItemId: "L1", salesOrderId: "SO-1", lineStatus: "ACTIVE", priceSource: "MANUAL", quotationLineReference: "", description: "Supply", quantity: 5, unitPrice: 112, discountAmount: 56, taxMode: "VAT_INCLUSIVE", taxRate: 0.12 }] };
  const linkedItems = [{ salesOrderItemId: "L1", description: "Edited supply", quantity: 1, unitPrice: 224 }, { description: "Supply", quantity: 1, unitPrice: 112 }];
  const discount = resolveInvoiceDiscount(linkedItems, undefined, source, "sales");
  assert.equal(discount.discountAmount, 22.4);
  assert.equal(discount.itemDiscounts[1].discountAmount, 0, "Added manual line never inherits a discount by description");
  assert.throws(() => resolveInvoiceDiscount([{ ...linkedItems[0], salesOrderItemId: "OTHER-ORDER" }], undefined, source, "sales"));

  const headerText = fs.readFileSync("src/lib/invoiceRepository.ts", "utf8").match(/const SERVICE_INVOICES_HEADERS = \[([\s\S]*?)\] as const/)[1];
  const headers = [...headerText.matchAll(/"([^"]+)"/g)].map(match => match[1]);
  const db = { ServiceInvoices: [headers], SalesInvoices: [headers], ServiceInvoiceItems: [[]], SalesInvoiceItems: [[]] };
  const handovers = [];
  const col = name => [...name].reduce((v,c) => v * 26 + c.charCodeAt(0) - 64, 0) - 1;
  function parse(range) {
    const [sheet, coordinates] = range.split("!");
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/.exec(coordinates);
    if (!m || !db[sheet]) throw new Error(`Unexpected fixture range ${range}`);
    return { sheet, c: col(m[1]), r: Number(m[2])-1, lastC: col(m[3] || m[1]), lastR: m[4] ? Number(m[4])-1 : m[3] ? db[sheet].length-1 : Number(m[2])-1 };
  }
  async function update({ range, requestBody }) {
    const p = parse(range);
    requestBody.values.forEach((values, i) => { db[p.sheet][p.r+i] ??= []; values.forEach((value,j) => { db[p.sheet][p.r+i][p.c+j] = value; }); });
    return { data: {} };
  }
  const sheets = { spreadsheets: { values: {
    get: async ({ range }) => { const p = parse(range); return { data: { values: db[p.sheet].slice(p.r,p.lastR+1).map(row => row.slice(p.c,p.lastC+1)) } }; },
    append: async ({ range, requestBody }) => { const p = parse(range); const start = db[p.sheet].length+1; db[p.sheet].push(...requestBody.values.map(row => [...row])); const lastCol = String.fromCharCode(64+requestBody.values[0].length); return { data: { updates: { updatedRange: `${p.sheet}!A${start}:${lastCol}${db[p.sheet].length}` } } }; },
    update, batchUpdate: async ({ requestBody }) => { for (const data of requestBody.data) await update({ range: data.range, requestBody: { values: data.values } }); return { data: {} }; },
  } } };
  const repository = load("src/lib/invoiceRepository.ts", {
    "@/lib/googleSheets": { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => "in-memory" },
    "@/lib/companySheets": { getCustomers: async () => [{ companyId: "C1", companyName: "Fixture Customer" }], getCompanies: async () => [{ companyId: "C1", companyName: "Fixture Customer" }] },
    "@/lib/userSheets": { getUserById: async id => id === "invalid" ? undefined : { userId: id, fullName: `User ${id}` } },
    "@/lib/serviceInvoiceBilling": billing, "@/lib/serviceInvoiceFilters": filters,
    "@/lib/documentHandoverSheets": { ensureAutomaticDocumentHandover: async entry => { handovers.push(entry); return { outcome: "created" }; } },
    "@/lib/deliverySheets": { resolveDeliveryReceiptReferences: async () => ({ salesOrderId: "SO-1", poNo: "PO1", trNo: "SO-001" }), resolveDeliveryReceiptDeliveredBy: async () => ({ deliveredById: "technician", deliveredByName: "Technician" }) },
    "@/lib/salesOrders/service": { getOrderDetail: async () => source },
    "@/lib/salesOrders/repository": { readSalesOrderListSnapshot: async () => ({ orders: [source.order], items: source.items }), readSalesOrderById: async () => source.order },
  });
  const service = repository.createInvoiceRepository("service"), sales = repository.createInvoiceRepository("sales");
  const payload = { invoiceNo: "1001", date: "2024-01-01", customerId: "C1", preparedBy: "Tester", referenceMode: "TR_NUMBER", assignedPicUserId: "pic", manualCategories: ["Parts"], items: fixture.items };
  const originalError = console.error; console.error = () => {};
  try {
    await assert.rejects(sales.processServiceInvoice({ ...payload, assignedPicUserId: "" }), /Assigned PIC/);
    await assert.rejects(sales.processServiceInvoice({ ...payload, assignedPicUserId: "invalid" }), /Assigned PIC/);
    await assert.rejects(sales.processServiceInvoice({ ...payload, items: [{ ...fixture.items[0], quantity: -1 }] }), /positive quantity/);
    await assert.rejects(sales.processServiceInvoice({ ...payload, manualCategories: ["Service"] }), /Invalid invoice category/);
    assert.equal(db.SalesInvoices.length, 1, "Invalid requests did not save headers");
    const [serviceResult, salesResult] = await Promise.all([service.processServiceInvoice({ ...payload, assignedPicUserId: undefined, assignedTechnicianUserId: "tech" }, "tester"), sales.processServiceInvoice(payload, "tester")]);
    assert.equal(serviceResult.invoiceNo, salesResult.invoiceNo, "Numbers may overlap across types");
    assert.equal(serviceResult.assignedPicUserId, undefined, "Service Invoice has no separate PIC");
    assert.equal(serviceResult.invoiceKind, "service"); assert.equal(salesResult.invoiceKind, "sales");
    assert.equal(handovers.filter(entry => entry.documentNumber === "1001").length, 2);
    assert.deepEqual(new Set(handovers.map(entry => entry.documentType)), new Set(["service_invoice", "sales_invoice"]));
    await assert.rejects(sales.processServiceInvoice(payload), /already exists/);
    await sales.updateServiceInvoicePayment("1001", "full", "admin");
    assert.equal(JSON.parse(db.SalesInvoices[1][19]).paymentStatus, "full");
    assert.notEqual(JSON.parse(db.ServiceInvoices[1][19]).paymentStatus, "full");
    await sales.recordServiceInvoiceScan("1001", "https://example.test/scan", "admin");
    assert.equal(JSON.parse(db.SalesInvoices[1][19]).scannedFileLink, "https://example.test/scan");
    assert.equal(db.ServiceInvoices[1][9], "");
    const linked = await sales.processServiceInvoice({ ...payload, invoiceNo: "1002", drNumber: 42, referenceMode: "SALES_ORDER", items: linkedItems }, "tester");
    assert.equal(linked.discountAmount, 22.4);
    assert.equal(linked.assignedPicUserId, "pic");
    assert.equal(linked.assignedTechnicianUserId, "technician");
    assert.equal(handovers.at(-1).assignedToId, "pic", "DR technician must not override delivery PIC");
    const list = await sales.getServiceInvoices();
    assert.equal(list.find(invoice => invoice.invoiceNo === "1002").discountAmount, 22.4);
    assert.equal(list.find(invoice => invoice.invoiceNo === "1002").items[0].salesOrderItemId, "L1");
    await sales.updateServiceInvoiceCategory("1002", ["Supplies"], "tester");
    assert.deepEqual(JSON.parse(db.SalesInvoices[2][19]).manualCategories, ["Supplies"]);
    await assert.rejects(sales.updateServiceInvoiceCategory("1002", [], "tester"));
    const serviceList = await service.getServiceInvoices();
    assert.equal(serviceList.length, 1);
    assert.equal(invoiceTotals(serviceList[0]).lessWithholdingTax, 250);
    assert.equal(invoiceTotals(list.find(invoice => invoice.invoiceNo === "1001")).lessWithholdingTax, 125);
    assert.equal(invoiceTotals(list.find(invoice => invoice.invoiceNo === "1001")).totalAmountDue, 14000);
  } finally { console.error = originalError; }
  console.log("PASS VAT/withholding, empty print fields, categories, manual-line discounts, PIC validation, independent numbering/payment/scan storage, DR/PIC separation, linked category edits, and legacy recalculation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createLoader } = require("./proforma-runtime.cjs");
async function main() {
  const load = createLoader();
  const domain = load("src/lib/proforma/domain.ts");
  assert.equal(domain.proformaNumber(20), "AIC-PFI-000-020");
  assert.equal(domain.proformaNumber(1000), "AIC-PFI-001-000");
  assert.equal(domain.sequenceOf("AIC-PFI-001-000"), 1000);
  const order = { salesOrderId: "SO1", salesOrderNo: "AIC-SO-2026-1334", legacyTrackerNo: "1334", orderStatus: "CONFIRMED", customerId: "C1", customerNameSnapshot: "Test Customer", customerTINSnapshot: "TIN", billingAddressSnapshot: "Address", customerPONo: "PO1", grandTotal: 201.6, remarks: "Printed remark" };
  const line = { salesOrderItemId: "L1", productNameSnapshot: "Product", description: "Technical description", unitSnapshot: "PC", lineStatus: "ACTIVE", priceSource: "MANUAL", quantity: 2, unitPrice: 100, taxMode: "VAT_EXCLUSIVE", taxRate: 0.12, discountAmount: 20, cancelledQty: 0, quotationLineReference: "" };
  const defaults = domain.defaultProformaItems([line]);
  assert.equal(defaults[0].productName, "Product"); assert.equal(defaults[0].unitPrice, 112);
  const priced = domain.priceProformaItems(defaults, [line]);
  assert.equal(priced[0].discountAmount, 22.4); assert.equal(priced[0].amount, 201.6);
  const partial = domain.priceProformaItems([{ ...defaults[0], quantity: 1 }], [line]);
  assert.equal(partial[0].amount, 100.8);
  assert.equal(domain.priceProformaItems([{ ...defaults[0], salesOrderItemId: "", quantity: 1 }], [line])[0].discountAmount, 0);
  for (const overrides of [{ quantity: -1 }, { unitPrice: -1 }, { quantity: "" }, { quantity: Infinity }, { salesOrderItemId: "OTHER" }, { productName: "" }]) assert.throws(() => domain.priceProformaItems([{ ...defaults[0], ...overrides }], [line]));
  const base = { id: "draft-0000001", salesOrderId: "SO1", totalAmount: 100.8 };
  domain.assertWithinOrderTotal(order, base, [{ ...base, id: "other", status: "ISSUED" }]);
  assert.throws(() => domain.assertWithinOrderTotal(order, { ...base, totalAmount: 100.81 }, [{ ...base, id: "other", status: "ISSUED" }]));
  domain.assertWithinOrderTotal(order, { ...base, totalAmount: 201.6 }, [{ ...base, id: "other", status: "CANCELLED" }, { ...base, id: "draft-other", status: "DRAFT" }]);

  const { buildProformaMigration } = load("src/lib/proforma/migration.ts");
  const sourceRows = [[], [1192, "August 07, 2026", "PFI-012", "Client", "", "", "50% DP", 100], [1253, "2026-09-01", "PFI-012", "Client", "", "", "20% DP", 50], [null, null, "PFI-014"], [null, null, "PFI-020"]];
  const migrated = buildProformaMigration(sourceRows, [{ ...order, legacyTrackerNo: "1192" }], [], "2026-10-16T00:00:00Z");
  assert.equal(migrated.imports.length, 2); assert.equal(migrated.imports[0].invoiceNo, "AIC-PFI-000-014");
  assert.equal(migrated.imports[1].invoiceNo, "AIC-PFI-000-012"); assert.equal(migrated.imports[0].notes, "50% DP");
  assert.equal(migrated.imports[0].salesOrderId, "SO1"); assert.equal(sourceRows[1][2], "PFI-012");
  assert.equal(buildProformaMigration(sourceRows, [], migrated.imports, "now").imports.length, 0);

  let documents = [], locked = false, failTracker = false, syncCalls = 0, failStorage = "", mirrored = null, rollbacks = 0;
  const storage = {
    readProformas: async () => structuredClone(documents),
    writeProforma: async invoice => { if (failStorage === "before") throw new Error("App unavailable"); const i = documents.findIndex(item => item.id === invoice.id); if (i < 0) documents.push(structuredClone(invoice)); else documents[i] = structuredClone(invoice); if (failStorage === "after") throw new Error("Response lost"); },
    withProformaLock: async action => { if (locked) throw new Error("Concurrent save"); locked = true; try { return await action(); } finally { locked = false; } },
  };
  const services = createLoader({
    "@/lib/salesOrders/repository": { readSalesOrderById: async id => id === "SO1" ? order : null, readSalesOrderItems: async () => [line], readSalesOrders: async () => [order] },
  });
  // Resolve relative service dependencies with explicit shared mocks.
  const serviceText = fs.readFileSync("src/lib/proforma/service.ts", "utf8");
  const ts = require("typescript");
  const mod = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(serviceText, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => {
    if (id === "./repository") return storage;
    if (id === "./tracker") return { prepareProformaTrackerWrite: async (invoice, previous) => ({ apply: async () => { syncCalls++; if (failTracker) throw new Error("Offline"); mirrored = structuredClone(invoice); return 16; }, rollback: async () => { rollbacks++; mirrored = structuredClone(previous); } }) };
    if (id === "./domain") return domain;
    if (id === "@/lib/salesOrders/repository") return { readSalesOrderById: async id => id === "SO1" ? order : null, readSalesOrderItems: async () => [line], readSalesOrders: async () => [order] };
    return services(id.startsWith("@/") ? `src/${id.slice(2)}.ts` : id);
  }, mod, mod.exports);
  const service = mod.exports;
  const actor = { userId: "USER", fullName: "Test Preparer" };
  const input = { id: "draft-0000001", expectedVersion: 0, salesOrderId: "SO1", date: "2026-10-16", drNo: "3901", notes: "PRIVATE 50% DP", remarks: "Printed remark", items: [{ ...defaults[0], quantity: 1 }] };
  const draft = await service.saveProforma(input, actor);
  assert.equal(draft.invoiceNo, ""); assert.equal(syncCalls, 0);
  failTracker = true;
  await assert.rejects(service.changeProforma(draft.id, "issue", draft.version, actor), /Not saved.*Offline/);
  assert.equal(documents[0].status, "DRAFT"); assert.equal(documents[0].invoiceNo, ""); assert.equal(documents[0].version, draft.version);
  await assert.rejects(service.saveProforma({ ...input, id: "draft-new-fails", issue: true }, actor), /Not saved/);
  assert.equal(documents.length, 1, "Failed immediate issuance never leaves an intermediate saved draft");
  failTracker = false;
  const issued = await service.changeProforma(draft.id, "issue", draft.version, actor);
  assert.equal(issued.invoiceNo, "AIC-PFI-000-020");
  const retry = await service.changeProforma(draft.id, "issue", draft.version, actor);
  assert.equal(retry.invoiceNo, issued.invoiceNo); assert.equal(documents.length, 1);
  const noted = await service.changeProforma(retry.id, "notes", retry.version, actor, "20% DP reminder");
  assert.equal(noted.notes, "20% DP reminder"); assert.equal(noted.totalAmount, retry.totalAmount);
  failTracker = true;
  await assert.rejects(service.saveProforma({ ...input, expectedVersion: noted.version, remarks: "Edited remark" }, actor), /Not saved/);
  await assert.rejects(service.changeProforma(noted.id, "notes", noted.version, actor, "Unsaved notes"), /Not saved/);
  assert.equal(documents[0].notes, noted.notes);
  assert.equal(documents[0].version, noted.version); assert.equal(documents[0].remarks, noted.remarks);
  failTracker = false; failStorage = "before";
  await assert.rejects(service.saveProforma({ ...input, expectedVersion: noted.version, remarks: "Edited remark" }, actor), /restored/);
  assert.equal(rollbacks, 1); assert.equal(mirrored.remarks, noted.remarks); assert.equal(documents[0].version, noted.version);
  failStorage = "after";
  const edited = await service.saveProforma({ ...input, expectedVersion: noted.version, remarks: "Edited remark" }, actor);
  assert.equal(edited.invoiceNo, issued.invoiceNo); assert.equal(edited.status, "ISSUED"); assert.equal(edited.remarks, "Edited remark");
  assert.equal(rollbacks, 1, "Lost successful app response is reconciled without undoing its source write");
  failStorage = "";
  const second = await service.saveProforma({ ...input, id: "draft-0000002" }, actor);
  await service.changeProforma(second.id, "issue", second.version, actor);
  await assert.rejects(service.saveProforma({ ...input, expectedVersion: edited.version, items: defaults }, actor), /exceed/);
  const third = await service.saveProforma({ ...input, id: "draft-0000003" }, actor);
  await assert.rejects(service.changeProforma(third.id, "issue", third.version, actor), /exceed/);
  failTracker = true;
  await assert.rejects(service.changeProforma(issued.id, "cancel", edited.version, actor), /Not saved/);
  assert.equal(documents[0].status, "ISSUED");
  failTracker = false;
  await service.changeProforma(issued.id, "cancel", edited.version, actor);
  const afterCancel = await service.changeProforma(third.id, "issue", third.version, actor);
  assert.equal(afterCancel.invoiceNo, "AIC-PFI-000-022");
  await assert.rejects(service.changeProforma(afterCancel.id, "cancel", 0, actor), /changed/);
  assert.equal(documents.find(item => item.id === issued.id).status, "CANCELLED");
  await assert.rejects(service.saveProforma({ ...input, id: "draft-0000004", date: "2026-02-30" }, actor), /valid invoice date/);

  const trackerRows = Array.from({ length: 17 }, () => []);
  trackerRows[0] = ["TR No.", "Date", "Invoice No.", "Customer Name", "TIN", "Address", "Description", "Total Amount"];
  trackerRows[15] = ["", "", "PFI-020", "", "", "", "", "", 123, "BALANCE", "PAYMENT", "DATE", "PAID", "CHECK", "2307", "CR", "", "AGING"];
  const writes = [];
  let customerAllowed = true, batchFailure = "";
  const nativeCells = Array.from({ length: 20 }, () => ({}));
  nativeCells[3] = { dataValidation: { strict: true, condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: "='Client Directory'!$B$2:$B" }] } } };
  nativeCells[4] = { userEnteredValue: { formulaValue: '=XLOOKUP(D16,Directory!B:B,Directory!F:F)' } };
  nativeCells[5] = { userEnteredValue: { formulaValue: '=XLOOKUP(D16,Directory!B:B,Directory!G:G)' } };
  const trackerLoad = createLoader({ "@/lib/googleSheets": { getSheetsClient: async () => ({ spreadsheets: {
    get: async args => args.ranges ? ({ data: { sheets: [{ data: [{ startRow: 15, rowData: [{ values: nativeCells.map((cell, column) => cell.userEnteredValue || trackerRows[15][column] == null ? structuredClone(cell) : { ...cell, userEnteredValue: typeof trackerRows[15][column] === "number" ? { numberValue: trackerRows[15][column] } : { stringValue: trackerRows[15][column] } }) }] }, { startRow: 14, rowData: [{ values: nativeCells }] }] }] } }) : ({ data: { sheets: [{ properties: { sheetId: 1156547389, title: "Order w/o Invoice", gridProperties: { rowCount: 1002 } } }] } }),
    batchUpdate: async value => {
      if (batchFailure === "before") throw new Error("Offline");
      writes.push(value);
      for (const request of value.requestBody.requests) if (request.updateCells) {
        const change = request.updateCells;
        change.rows[0].values.forEach((cell, i) => { trackerRows[change.range.startRowIndex][change.range.startColumnIndex + i] = cell.userEnteredValue?.numberValue ?? cell.userEnteredValue?.stringValue ?? ""; });
      }
      if (batchFailure === "after") throw new Error("Response lost");
    },
    values: { get: async args => ({ data: { values: args.range.includes("Client Directory") ? [[customerAllowed ? "Test Customer" : "OTHER CUSTOMER"]] : args.range.includes("A16:T16") ? [trackerRows[15]] : trackerRows } }) },
  } }) } });
  const tracker = trackerLoad("src/lib/proforma/tracker.ts");
  const mirrorTracker = async (invoice, previous) => (await tracker.prepareProformaTrackerWrite(invoice, previous)).apply();
  // Pre-existing payment data makes this row occupied; it must not be overwritten.
  await assert.rejects(mirrorTracker(issued), /already in use/);
  trackerRows[15] = ["", "", "PFI-020"];
  assert.equal(await mirrorTracker(issued), 16);
  const changes = writes[0].requestBody.requests.filter(request => request.updateCells).map(request => request.updateCells);
  assert.deepEqual(changes.map(change => [change.range.startRowIndex, change.range.startColumnIndex, change.range.endColumnIndex]), [[15, 0, 4], [15, 6, 8], [15, 16, 17]], "Never overwrite TIN/address lookup or payment cells");
  for (const change of changes) change.rows[0].values.forEach((cell, i) => { trackerRows[15][change.range.startColumnIndex + i] = cell.userEnteredValue.numberValue ?? cell.userEnteredValue.stringValue; });
  trackerRows[15][8] = 123; // Payments added after sync must survive a retry.
  await mirrorTracker(issued);
  const modified = { ...issued, totalAmount: 99, remarks: "Changed" };
  const preparedEdit = await tracker.prepareProformaTrackerWrite(modified, issued);
  await preparedEdit.apply();
  assert.equal(trackerRows[15][7], 99); assert.equal(trackerRows[15][8], 123);
  await preparedEdit.rollback();
  assert.equal(trackerRows[15][7], issued.totalAmount); assert.equal(trackerRows[15][8], 123);
  const lostResponse = await tracker.prepareProformaTrackerWrite(modified, issued);
  batchFailure = "after";
  assert.equal(await lostResponse.apply(), 16, "A lost source response is reconciled by readback");
  batchFailure = "";
  await lostResponse.rollback();
  batchFailure = "before";
  await assert.rejects(mirrorTracker(modified, issued), /Offline/);
  batchFailure = "";
  customerAllowed = false;
  await assert.rejects(mirrorTracker(issued), /not in the source/);
  customerAllowed = true;
  nativeCells[0] = { userEnteredValue: { formulaValue: "=OTHER()" } };
  await assert.rejects(mirrorTracker(issued), /contains a formula/);
  nativeCells[0] = {};
  trackerRows[16] = ["", "", "PFI-020"];
  await assert.rejects(mirrorTracker(issued), /duplicate/);

  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const printLoad = createLoader({ "@/lib/userSignatures": { signerNameKey: name => name.toLowerCase() } });
  const Print = printLoad("src/components/proforma-invoice-print-document.tsx").ProformaInvoicePrintDocument;
  const html = renderToStaticMarkup(React.createElement(Print, { invoice: issued }));
  assert.ok(!html.includes(input.notes)); assert.ok(!html.includes("Delivered by")); assert.ok(!html.includes("Withholding"));
  assert.ok(html.includes("TOTAL AMOUNT DUE")); assert.ok(html.includes("Prepared by")); assert.ok(html.includes("Received by / Date"));
  const shell = printLoad("src/components/business-document-print-layout.tsx").businessDocumentPrintShell;
  fs.mkdirSync("tmp/proforma-print-check", { recursive: true });
  fs.writeFileSync("tmp/proforma-print-check/proforma.html", shell.replace("</body>", `${html}</body>`));
  console.log("Proforma tests passed: numbering, partial discounts, order limits, migration, automatic mirrored saves, source failure blocking, issued edits, lost responses, restoration, cancellations, payment/formula preservation, and print privacy.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

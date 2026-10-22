/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const mod = { exports: {} };
let db, rejectBatch, calls;
const names = ["ServiceInvoices", "DeliveryReceipts", "DocumentHandover"];
const sheets = { spreadsheets: {
  get: async () => ({ data: { sheets: names.map((title, sheetId) => ({ properties: { title, sheetId } })) } }),
  values: { get: async () => ({ data: { values: db[2].slice(1) } }) },
  batchUpdate: async ({ requestBody: { requests } }) => {
    calls++;
    if (rejectBatch) throw new Error("Sheets unavailable");
    const next = structuredClone(db);
    for (const request of requests) {
      const operation = request.appendCells || request.updateCells;
      const row = operation.rows[0].values.map(cell => cell.userEnteredValue.stringValue ?? cell.userEnteredValue.numberValue);
      if (request.appendCells) next[operation.sheetId].push(row);
      else next[operation.start.sheetId][operation.start.rowIndex] = row;
    }
    db = next;
  },
} };
const mocks = {
  "@/lib/googleSheets": { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => "test" },
  "@/lib/userSheets": { getUserById: async id => id === "tech" ? { userId: id, fullName: "Technician" } : undefined, getUsers: async () => [{ userId: "tech", fullName: "Technician" }] },
};
const js = ts.transpileModule(fs.readFileSync("src/lib/documentHandoverCommit.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("require", "module", "exports", js)(id => mocks[id] || require(id), mod, mod.exports);
const commit = mod.exports.commitDocumentWithHandover;
const input = { documentType: "service_invoice", documentNumber: "1662", assignedToId: "tech", assignedToName: "Technician", assignedBy: "admin", assignedByName: "Admin" };
const reset = () => { db = [[[]], [[]], [[]]]; rejectBatch = false; calls = 0; };
async function main() {
  for (const [sheet, type] of [["ServiceInvoices", "service_invoice"], ["DeliveryReceipts", "delivery_receipt"]]) {
    reset();
    const source = { sheet, row: ["1662", "=literal text", 123] };
    const assignment = { ...input, documentType: type };
    rejectBatch = true;
    await assert.rejects(commit(source, assignment), /Sheets unavailable/);
    assert.deepEqual(db, [[[]], [[]], [[]]], "Failed batch persists neither header nor handover");
    rejectBatch = false;
    assert.equal(await commit(source, assignment), "created");
    assert.equal(db[names.indexOf(sheet)][1][1], "=literal text");
    assert.equal(db[2][1][9], "handed_over");
    assert.equal(db[2][1][4], "tech");
    await commit({ ...source, rowNumber: 2 }, assignment);
    assert.equal(db[2].length, 2, "Editing/retrying does not append another tracker row");
    for (const status of ["returned", "received_by_after_sales", "unassigned"]) {
      db[2][1][9] = status;
      const previous = structuredClone(db[2]);
      await commit({ ...source, rowNumber: 2 }, { ...assignment, assignedToId: "missing" });
      assert.deepEqual(db[2], previous, "Manual custody decisions survive source edits");
    }
  }
  reset();
  await assert.rejects(commit({ sheet: "ServiceInvoices", row: ["1662"] }, { ...input, assignedToId: "missing" }), /valid document holder/);
  assert.equal(calls, 0, "Invalid holder rejected before writes");
  await assert.rejects(commit(undefined, { ...input, documentNumber: "DRAFT-1" }), /finalized/);
  assert.equal(calls, 0);
  await commit(undefined, { ...input, assignedAt: "2026-10-01T01:48:57.291Z" });
  assert.equal(db[2][1][8], "2026-10-01T01:48:57.291Z");
  await commit(undefined, input);
  assert.equal(db[2].length, 2, "Repeated recovery is idempotent");
  reset();
  db[0].push(["DRAFT-1"]);
  await commit({ sheet: "ServiceInvoices", row: ["1662"], rowNumber: 2 }, input);
  assert.equal(db[0][1][0], "1662");
  assert.equal(db[2][1][2], "1662", "Finalization uses the real number");
  reset();
  await commit({ sheet: "DeliveryReceipts", row: ["3717"] }, { ...input, documentType: "delivery_receipt", documentNumber: "3717", assigneeType: "external", assignedToId: "", assignedToName: "Courier" });
  assert.equal(db[2][1][14], "external");
  assert.equal(db[2][1][5], "Courier");
  db[2].push([...db[2][1]]);
  await assert.rejects(commit(undefined, { ...input, documentType: "delivery_receipt", documentNumber: "3717" }), /Duplicate/);
  // Exercise real DR entry points: no independent header/template write can run
  // before the atomic handover commit, including draft promotion.
  const stop = new Error("ATOMIC_COMMIT");
  let recorded;
  let sourceRow = Array(19).fill("");
  sourceRow[0] = "3717"; sourceRow[2] = "customer"; sourceRow[8] = "Technician";
  sourceRow[10] = "created"; sourceRow[15] = "tech";
  function load(file, dependencies) {
    const loaded = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "module", "exports", code)(id => dependencies[id] ?? (id.startsWith("@/") ? {} : require(id)), loaded, loaded.exports);
    return loaded.exports;
  }
  const dr = load("src/lib/deliverySheets.ts", {
    "@/lib/googleSheets": { getDatabaseSpreadsheetId: async () => "test", getSheetsClient: async () => ({ spreadsheets: { values: {
      get: async ({ range }) => ({ data: { values: range.endsWith("A2:A") ? [[sourceRow[0]]] : [sourceRow] } }),
      append: async () => { throw new Error("Unexpected independent append"); },
      update: async () => { throw new Error("Unexpected independent update"); },
    } } }) },
    "@/lib/userSheets": mocks["@/lib/userSheets"],
    "@/lib/companySheets": { getCompanies: async () => [{ companyId: "customer", companyName: "Customer" }] },
    "@/lib/deliveryReference": load("src/lib/deliveryReference.ts", {}),
    "@/lib/documentHandoverCommit": { commitDocumentWithHandover: async (source, assignment) => { recorded = { source, assignment }; throw stop; } },
  });
  const logError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(dr.processDeliveryReceipt({ drNumber: 3718, companyId: "customer", date: "2026-10-22", status: "created", deliveredById: "tech", deliveredBy: "Technician", referenceMode: "TR_NUMBER", trNo: "TR-1", items: [] }, "admin"), error => error === stop);
    assert.equal(recorded.assignment.documentNumber, "3718");
    assert.equal(recorded.source.sheet, "DeliveryReceipts");
    await assert.rejects(dr.updateDeliveryReceipt(3717, { status: "created" }, "admin"), error => error === stop);
    assert.equal(recorded.source.rowNumber, 2);
    sourceRow[0] = "-123"; sourceRow[10] = "draft";
    await assert.rejects(dr.updateDeliveryReceipt(-123, { status: "created" }, "admin"), error => error === stop);
    assert.ok(Number(recorded.assignment.documentNumber) > 0);
    assert.equal(recorded.source.row[0], recorded.assignment.documentNumber);
  } finally { console.error = logError; }
  console.log("PASS atomic SI/DR save, failures, finalization, holder validation, external delivery, custody preservation, recovery, duplicate detection");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

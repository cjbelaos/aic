/* eslint-disable @typescript-eslint/no-require-imports -- Administrative Node script. */
// Audit by default. --apply performs only the user-authorized correction of 1721.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
function load(file) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)(require, mod, mod.exports);
  return mod.exports;
}
async function main() {
  const api = load("src/lib/googleSheets.ts");
  const sheets = await api.getSheetsClient();
  const spreadsheetId = await api.getDatabaseSpreadsheetId();
  const ranges = ["ServiceInvoices!A1:U", "ServiceInvoiceItems!A2:G", "Companies!A2:C", "Contracts!A2:I"];
  const read = async () => (await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, valueRenderOption: "UNFORMATTED_VALUE" })).data.valueRanges.map(r => r.values || []);
  const snapshot = await read();
  const [invoices, items, companies, contracts] = snapshot;
  assert.equal(invoices[0][0], "InvoiceNo");
  assert.equal(invoices[0][10], "ContractId");
  assert.equal(invoices[0][19], "ManualCompletionData");
  const target = number => {
    const matches = invoices.map((row, i) => ({ row, rowNumber: i + 1 })).filter(({ row }) => String(row[0]) === number);
    assert.equal(matches.length, 1, `Expected exactly one invoice ${number}`);
    return matches[0];
  };
  const service = target("1721");
  const pms = target("1720");
  const summarize = ({ row }) => ({
    invoiceNo: String(row[0]), customer: companies.find(c => c[0] === row[2])?.[2],
    status: row[8], contractId: row[10] || "", drNumber: row[11] || "", salesOrderId: row[18] || "",
    referenceMode: row[20], metadata: row[19] ? JSON.parse(row[19]) : {},
    items: items.filter(item => String(item[0]) === String(row[0])).map(item => ({ description: item[1], quantity: Number(item[2]), unitPrice: Number(item[3]), amount: Number(item[4]) })),
  });
  const serviceInfo = summarize(service), pmsInfo = summarize(pms);
  const contract = contracts.find(c => c[0] === pms.row[10]);
  console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "audit", invoices: [serviceInfo, pmsInfo], contract: contract && { id: contract[0], customerId: contract[1], status: contract[7], monthlyServiceFee: contract[8] } }, null, 2));
  assert.equal(serviceInfo.customer, "TAGAYTAY MEDICAL CENTER");
  assert.equal(pmsInfo.customer, "TAGAYTAY MEDICAL CENTER");
  assert.equal(service.row[2], pms.row[2]);
  assert.equal(serviceInfo.status, "created");
  assert.equal(pmsInfo.status, "created");
  assert.equal(serviceInfo.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), 4500);
  assert.equal(pmsInfo.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), 23000);
  assert(contract && contract[1] === pms.row[2] && Number(String(contract[8]).replace(/[^\d.]/g, "")) === 23000);
  assert(pmsInfo.items.every(i => /PMS/i.test(i.description)), "Verify the monthly invoice description");
  assert(serviceInfo.items.every(i => !/PMS FOR THE MONTH/i.test(i.description)), "Service invoice still contains a PMS monthly item");
  assert(!serviceInfo.drNumber && !serviceInfo.salesOrderId, "Linked documents require a separate correction review");
  assert(!serviceInfo.metadata.fulfillmentIds?.length && !service.row[14], "Review existing fulfillment/report links before detaching a contract");
  const metadata = serviceInfo.metadata;
  if (!serviceInfo.contractId && metadata.manualCategories?.join() === "Service") {
    console.log("Invoice 1721 is already corrected; invoice 1720 verified unchanged."); return;
  }
  assert.equal(serviceInfo.contractId, pmsInfo.contractId);
  if (!process.argv.includes("--apply")) { console.log("Verified: 1721 can be detached from the PMS contract and assigned Service. No writes performed."); return; }
  // Re-read before writing and back up the two exact rows for recovery.
  const fresh = await read();
  assert.deepEqual(fresh, snapshot, "Data changed during audit; retry the audit before applying");
  fs.mkdirSync("tmp/invoice-billing-repair", { recursive: true });
  const backup = `tmp/invoice-billing-repair/tagaytay-${Date.now()}.json`;
  fs.writeFileSync(backup, JSON.stringify({ service, pms }, null, 2));
  const changedAt = new Date().toISOString();
  const changedBy = "maintenance:tagaytay-billing-correction";
  const next = { ...metadata, billingMode: "REGULAR", manualCategories: ["Service"], billingHistory: [...(metadata.billingHistory || []), { fromContractId: serviceInfo.contractId, toContractId: "", billingMode: "REGULAR", changedBy, changedAt, reason: "User-authorized correction: invoice 1721 is a separate service charge; 1720 is monthly PMS." }] };
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
    { range: `ServiceInvoices!K${service.rowNumber}`, values: [[""]] },
    { range: `ServiceInvoices!T${service.rowNumber}`, values: [[JSON.stringify(next)]] },
    { range: `ServiceInvoices!G${service.rowNumber}:H${service.rowNumber}`, values: [[changedBy, changedAt]] },
  ] } });
  const after = await read();
  const expected = [...service.row]; expected[6] = changedBy; expected[7] = changedAt; expected[10] = ""; expected[19] = JSON.stringify(next);
  assert.deepEqual(after[0][service.rowNumber - 1], expected);
  assert.deepEqual(after[0][pms.rowNumber - 1], pms.row);
  assert.deepEqual(after[1], items, "Invoice items must remain unchanged");
  console.log(`Verified correction: 1721 = Service; 1720 remains PMS. Backup: ${backup}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

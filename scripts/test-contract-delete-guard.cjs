/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Sheets regression harness. */
// A contract that invoices or live releases reference must not be deleted (invoice 1713 was
// left billed against deleted CTR-0041; CTR-0007's completed releases outlived it).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => (Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') || id.startsWith('./') ? {} : require(id)), fixture, fixture.exports);
  return fixture.exports;
}

const integrity = load('src/lib/contractIntegrity.ts');
const invoice = (no, contractId) => [no, '', '', '', '', '', '', '', 'created', '', contractId];
const release = (id, contractId, status) => [id, 'CTI-1', contractId, '', '', '', '', '', '', '', '', status];

async function main() {
  const { contractDeleteBlocker } = integrity;
  assert.equal(contractDeleteBlocker('CTR-0001', { invoiceRows: [invoice('1700', 'CTR-0002')], releaseRows: [release('REL-1', 'CTR-0001', 'Deleted'), release('REL-2', 'CTR-0001', 'Cancelled')] }), null);
  assert.match(contractDeleteBlocker('CTR-0041', { invoiceRows: [invoice('1713', 'CTR-0041')], releaseRows: [] }), /CTR-0041 can't be deleted because 1 invoice \(1713\) still reference it/);
  assert.match(contractDeleteBlocker('CTR-0007', { invoiceRows: [], releaseRows: [release('REL-3', 'CTR-0007', 'Completed')] }), /1 release still reference/);
  assert.match(contractDeleteBlocker(' CTR-0007 ', { invoiceRows: [invoice('1', 'CTR-0007'), invoice('1', 'CTR-0007'), invoice('2', 'CTR-0007')], releaseRows: [release('R', 'CTR-0007', 'Pending')] }), /2 invoices \(1, 2\) and 1 release/);

  // deleteContractFromSheets refuses before touching the sheet.
  let batchUpdates = 0;
  const values = {
    'Contracts!A2:Q': [['CTR-0041', 'C1']],
    'ContractItems!A2:F': [], 'ContractReleases!A2:M': [], 'ContractNotes!A2:E': [],
  };
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: ['Contracts', 'ContractItems', 'ContractReleases', 'ContractNotes', 'ServiceInvoices', 'SalesInvoices'].map((title, sheetId) => ({ properties: { title, sheetId: sheetId + 1 } })) } }),
    batchUpdate: async () => { batchUpdates++; },
    values: {
      get: async ({ range }) => ({ data: { values: values[range] ?? (range.startsWith('Contracts!') ? values['Contracts!A2:Q'] : []) } }),
      batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map((r) => ({ values: r.startsWith('ServiceInvoices') ? [invoice('1713', 'CTR-0041')] : [] })) } }),
    },
  } };
  const contracts = load('src/lib/contractSheets.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'sheet' },
    '@/lib/contractIntegrity': integrity,
    './contractNoteSheets': { CONTRACT_NOTES_TAB: 'ContractNotes' },
  });
  const originalError = console.error; console.error = () => {};
  try {
    await assert.rejects(contracts.deleteContractFromSheets('CTR-0041'), (e) => e.name === 'ContractConflictError' && /1713/.test(e.message));
  } finally { console.error = originalError; }
  assert.equal(batchUpdates, 0, 'a blocked delete must not remove any rows');

  // Route is admin-only.
  const route = fs.readFileSync('src/app/api/contracts/[id]/route.ts', 'utf8');
  assert.match(route.slice(route.indexOf('export async function DELETE')), /requireAdminSession\(\)/);
  console.log('Contract delete guard regression tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Sheets regression harness. */
// A draft DR keeps its items under a negative placeholder number. Promoting it with
// edited items must write them under the real number AND clear the placeholder copies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => (Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') ? (require('./lib/sheets-mode-stubs.cjs').SHEETS_MODE_STUBS[id] ?? {}) : require(id)), fixture, fixture.exports);
  return fixture.exports;
}

const PLACEHOLDER = -1795356477;

function harness() {
  const calls = { replaced: [], renamed: [] };
  const draftRow = [String(PLACEHOLDER), '2026-11-22', 'C1', '', 'TR-1', '', '', 'Prep', 'Driver', '2026-11-22T14:07:57.000Z', 'draft', '', 'u1', '', '', '', 'internal', '', ''];
  const sheets = {
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          if (/!A2:A$/.test(range)) return { data: { values: [['4089'], [String(PLACEHOLDER)]] } };
          return { data: { values: [draftRow] } };
        },
        update: async () => ({}),
        append: async () => ({}),
        batchUpdate: async () => ({}),
      },
    },
  };
  const deliverySheets = load('src/lib/deliverySheets.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'sheet' },
    '@/lib/companySheets': { getCompanies: async () => [{ companyId: 'C1', companyName: 'Client' }] },
    '@/lib/deliveryPrintForm': { validateForCompany: () => null },
    '@/lib/deliveryReference': load('src/lib/deliveryReference.ts'),
    '@/lib/documentHandoverCommit': { commitDocumentWithHandover: async () => {} },
    '@/lib/transactionItemSheets': {
      replaceDeliveryItems: async (dr, items) => { calls.replaced.push({ dr, count: items.length }); },
      renameDeliveryItemReferences: async (from, to) => { calls.renamed.push({ from, to }); },
      getDeliveryItems: async () => new Map(),
    },
  });
  return { deliverySheets, calls };
}

async function main() {
  const item = { productCode: 'P1', description: 'Item', quantity: 2, unit: 'pc' };

  // Promotion with edited items: new rows under the real number, placeholder rows cleared after.
  let { deliverySheets, calls } = harness();
  const result = await deliverySheets.updateDeliveryReceipt(PLACEHOLDER, { status: 'printed', items: [item, item] }, 'u1');
  assert.equal(result.drNumber, 4090);
  assert.deepEqual(calls.replaced, [{ dr: 4090, count: 2 }, { dr: PLACEHOLDER, count: 0 }], 'placeholder items must be cleared after the real items are written');
  assert.deepEqual(calls.renamed, []);

  // Promotion without items: existing rows are re-keyed, nothing is cleared.
  ({ deliverySheets, calls } = harness());
  await deliverySheets.updateDeliveryReceipt(PLACEHOLDER, { status: 'printed' }, 'u1');
  assert.deepEqual(calls.renamed, [{ from: PLACEHOLDER, to: 4090 }]);
  assert.deepEqual(calls.replaced, []);

  // Editing a draft that stays a draft keeps its placeholder rows.
  ({ deliverySheets, calls } = harness());
  await deliverySheets.updateDeliveryReceipt(PLACEHOLDER, { status: 'draft', items: [item] }, 'u1');
  assert.deepEqual(calls.replaced, [{ dr: PLACEHOLDER, count: 1 }]);

  console.log('Delivery draft promotion regression tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

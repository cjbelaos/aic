/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Sheets regression harness. */
// Contact IDs must not be reused after a delete removes a row (two contacts shared cont_25).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => (Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') ? (require('./lib/sheets-mode-stubs.cjs').SHEETS_MODE_STUBS[id] ?? {}) : require(id)), fixture, fixture.exports);
  return fixture.exports;
}

async function main() {
  // cont_2 was deleted, so 3 rows remain but cont_4 is the highest live ID.
  const rows = [['cont_1', 'C1', 'A'], ['cont_3', 'C1', 'B'], ['cont_4', 'C2', 'C']];
  const appended = [];
  const sheets = { spreadsheets: { values: {
    get: async () => ({ data: { values: rows } }),
    append: async ({ requestBody }) => { appended.push(requestBody.values[0]); },
  } } };
  const contacts = load('src/lib/companyContactSheets.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'sheet' },
  });

  assert.equal(contacts.nextContactId(rows), 'cont_5');
  assert.equal(contacts.nextContactId([]), 'cont_1');
  assert.equal(contacts.nextContactId([['legacy'], ['CONT_9'], [' cont_7 ']]), 'cont_10');

  const created = await contacts.addCompanyContact({ companyId: 'C3', fullName: 'New Person', email: '', phone: '', isPrimary: false });
  assert.equal(appended[0][0], 'cont_5', 'a new contact must not reuse a live ID');
  assert.equal(created.contactId, 'cont_5');
  assert.equal(created.id, 'cont_4', 'the row-position id still points at the appended row');
  console.log('Company contact ID regression tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

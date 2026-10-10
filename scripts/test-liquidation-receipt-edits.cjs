/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server validation harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}, extra = '') {
  const fixtureModule = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(
    (id) => id in mocks ? mocks[id] : require(id), fixtureModule, fixtureModule.exports,
  );
  return fixtureModule.exports;
}

const validation = load('src/lib/liquidation-validation.ts');
const { validateItems } = load('src/lib/liquidationSheets.ts', {
  '@/lib/liquidation-validation': validation,
  '@/lib/googleSheets': {},
}, '\nexport { validateItems };');
const legacy = { date: '2026-10-07', description: 'OLD RECEIPT', category: 'Other', amount: 100, vat: 0 };
const valid = { ...legacy, description: 'NEW RECEIPT', supplierName: 'SUPPLIER', address: 'ADDRESS' };
const stored = Array.from({ length: 8 }, (_, i) => ({ ...legacy, description: `RECEIPT ${i + 1}` }));
const updated = stored.map((item, i) => i === 7 ? valid : item);
assert.equal(validateItems(updated, stored).length, 8, 'receipt 8 saves despite incomplete receipt 1');
assert.match(validation.getVatVendorError(updated), /Receipt item 1:/, 'submission still rejects legacy gaps');
assert.equal(validateItems(stored.slice(1), stored).length, 7, 'deletion preserves unchanged legacy receipts');
assert.throws(() => validateItems([...stored, legacy], stored), /Receipt item 9:/, 'new incomplete receipt is blocked');
assert.throws(() => validateItems([...stored, stored[0]], stored), /Receipt item 9:/, 'duplicate cannot reuse legacy exemption');
assert.throws(() => validateItems(stored.map((item, i) => i === 7 ? { ...item, amount: 200 } : item), stored), /Receipt item 8:/);
for (const field of ['supplierName', 'address']) {
  assert.throws(() => validateItems([{ ...valid, [field]: ' ' }]), /Enter/);
}
assert.throws(() => validateItems([{ ...valid, vat: 12 }]), /TIN/);
assert.throws(() => validateItems([{ ...valid, vat: 12, tin: '123' }]), /document reference/);
assert.equal(validateItems([{ ...valid, vat: 12, tin: '123', siNumber: 'SI-1' }]).length, 1);
assert.equal(validateItems([valid]).length, 1, 'non-VAT receipt needs no TIN or reference');
console.log('Liquidation receipt edit/add regression checks passed.');

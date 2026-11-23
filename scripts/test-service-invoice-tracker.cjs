/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads server modules with isolated Sheets mocks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

function load(file, mocks = {}) {
  const fixtureModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : id.startsWith('.') ? load(path.resolve(path.dirname(file), id.endsWith('.ts') ? id : `${id}.ts`), mocks) : require(id), fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- Task 1: projection ----------
const projection = () => load('src/lib/serviceInvoiceTracker/projection.ts');
const item = (description, unitPrice, extra = {}) => ({ description, quantity: 1, unitPrice, ...extra });
const base = { invoiceNo: '1801', status: 'created', date: '2026-11-22', companyName: 'MEDICAL CENTER PARANAQUE', items: [item('PMS FOR THE MONTH OF NOVEMBER 2026', 25000)] };

test('isInScope: 1801+ non-draft only', () => {
  const p = projection();
  assert.equal(p.TRACKER_FIRST_INVOICE, 1801);
  assert.equal(p.isInScope('1801', 'created'), true);
  assert.equal(p.isInScope('1800', 'created'), false);
  assert.equal(p.isInScope('1843', 'draft'), false);
  assert.equal(p.isInScope('DRAFT-1792638872160', 'draft'), false);
});

test('normalizeInvoiceNo strips leading zeros', () => {
  const p = projection();
  assert.equal(p.normalizeInvoiceNo('0944'), '944');
  assert.equal(p.normalizeInvoiceNo(1801), '1801');
  assert.equal(p.normalizeInvoiceNo(' 1801 '), '1801');
});

test('toDateSerial matches Sheets serials', () => {
  const p = projection();
  assert.equal(p.toDateSerial('2026-11-22'), 46348);
  assert.equal(p.toDateSerial('2026-01-02'), 46024);
});

test('describeInvoice: linked SO uses active lines in lineNo order (SI 1841)', () => {
  const p = projection();
  const h = p.describeInvoice({ ...base, salesOrderLines: [
    { lineNo: 1, description: 'PRE-TREATMENT REBEDDING OF WATER SOFTENER 16X65 (2.5)', lineStatus: 'INACTIVE' },
    { lineNo: 3, description: 'WATER SOFTENER REBEDDING (16x62)', lineStatus: 'ACTIVE' },
    { lineNo: 2, description: 'REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)', lineStatus: 'ACTIVE' },
  ] });
  assert.equal(h, 'REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)\nWATER SOFTENER REBEDDING (16x62)');
});

test('describeInvoice: no SO lists every invoice line incl. service charge (SI 1835)', () => {
  const p = projection();
  const h = p.describeInvoice({ ...base, items: [item('REPAIR OF 5 STATION REPROCESSING A (NEGATIVE)', 4025), item('SERVICE CHARGE 2', 0)] });
  assert.equal(h, 'REPAIR OF 5 STATION REPROCESSING A (NEGATIVE)\nSERVICE CHARGE 2');
});

test('projectTrackerRow: contract invoice', () => {
  const p = projection();
  assert.deepEqual(p.projectTrackerRow({ ...base, contractId: 'CTR-0013', poNo: '' }), { a: 'Contracted', b: '', c: 46348, e: 'MEDICAL CENTER PARANAQUE', h: 'PMS FOR THE MONTH OF NOVEMBER 2026', j: 25000 });
});

test('projectTrackerRow: service invoice with PO and discount', () => {
  const p = projection();
  const r = p.projectTrackerRow({ ...base, poNo: '4000251405', discountAmount: 500, items: [item('RO PREVENTIVE MAINTENANCE PACKAGE', 20000), item('FOR MALABON HOSPITAL MEDICAL CENTER', 0)] });
  assert.equal(r.a, 'Service');
  assert.equal(r.b, '4000251405');
  assert.equal(r.j, 19500);
});

test('projectTrackerRow: package line listed in H, adds 0 to J', () => {
  const p = projection();
  const r = p.projectTrackerRow({ ...base, items: [item('RO CHECK VALVE STAINLESS 3/4"', 6720), item('CHECK VALVE AND BREAKER REPLACEMENT', 0, { includedInPackage: true })] });
  assert.equal(r.h, 'RO CHECK VALVE STAINLESS 3/4"\nCHECK VALVE AND BREAKER REPLACEMENT');
  assert.equal(r.j, 6720);
});

test('projectTrackerRow: cancelled/void/deleted use CANCELLED format', () => {
  const p = projection();
  for (const status of ['cancelled', 'void', 'deleted']) {
    const r = p.projectTrackerRow({ ...base, status, contractId: 'CTR-1' });
    assert.equal(r.a, '', status); assert.equal(r.b, 'CANCELLED', status); assert.equal(r.j, '', status);
    assert.equal(r.e, 'MEDICAL CENTER PARANAQUE', status); assert.equal(r.h, 'PMS FOR THE MONTH OF NOVEMBER 2026', status);
    assert.equal(r.c, 46348, status);
  }
});

test('projectionToCells orders A,B,C,E,H,J', () => {
  const p = projection();
  assert.deepEqual(p.projectionToCells({ a: 'Service', b: 'PO', c: 1, e: 'X', h: 'Y', j: 2 }), ['Service', 'PO', 1, 'X', 'Y', 2]);
});

test('isRowWritable: blank placeholder / owned / hand-filled / edited', () => {
  const p = projection();
  const filled = ['Contracted', '', 46333, 'IRENE PEDRO', 'PMS FOR THE MONTH OF NOVEMBER 2026', 7000];
  assert.equal(p.isRowWritable(['', '', '', '', '', '']), true);
  assert.equal(p.isRowWritable([undefined, null, '', '', '', '']), true);
  assert.equal(p.isRowWritable(filled), false);
  assert.equal(p.isRowWritable(filled, [...filled]), true);
  assert.equal(p.isRowWritable(['Contracted', '', '46333', 'IRENE PEDRO', 'PMS FOR THE MONTH OF NOVEMBER 2026', '7000'], filled), true);
  const edited = [...filled]; edited[4] = 'PMS NOV 2026';
  assert.equal(p.isRowWritable(edited, filled), false);
});

module.exports = { load, test, tests };

if (require.main === module) {
  (async () => {
    let failed = 0;
    for (const t of tests) {
      try { await t.fn(); console.log(`ok   ${t.name}`); }
      catch (error) { failed++; console.log(`FAIL ${t.name}\n     ${String(error && error.message || error).split('\n').join('\n     ')}`); }
    }
    console.log(`${tests.length - failed}/${tests.length} passed`);
    process.exit(failed ? 1 : 0);
  })();
}

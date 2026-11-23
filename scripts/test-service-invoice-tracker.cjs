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

// ---------- Task 2: sheet reader / write planner ----------
const HEADER = ['Category', 'Purchase Order No.', 'Date', 'Invoice No.', 'Customer Name', 'TIN', 'Address', 'Description', 'Classification', 'Total Amount'];
const LOOKUP_F = "=ifna(xlookup(E2,'Client Directory'!$B$2:$B,'Client Directory'!$F$2:$F),\"\")";
const LOOKUP_G = "=ifna(xlookup(E2,'Client Directory'!$B$2:$B,'Client Directory'!$G$2:$G),\"\")";
function trackerRow(d, cells = {}) {
  const row = ['', '', '', d, '', LOOKUP_F, LOOKUP_G, '', '', ''];
  for (const [k, v] of Object.entries(cells)) row[Number(k)] = v;
  return row;
}
function fakeSheets({ rows, directory = [['MEDICAL CENTER PARANAQUE']] }) {
  const calls = [];
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 1, title: 'Other', gridProperties: { rowCount: 5 } } }, { properties: { sheetId: 449964054, title: 'Service Invoice', gridProperties: { rowCount: 1483 } } }] } }),
    values: {
      batchGet: async (req) => { calls.push(['batchGet', req]); return { data: { valueRanges: [{ values: rows }, { values: directory }] } }; },
      append: async (req) => { calls.push(['append', req]); return { data: {} }; },
    },
    batchUpdate: async (req) => { calls.push(['batchUpdate', req]); return { data: {} }; },
  } };
  return { sheets, calls };
}
const sheetModule = () => load('src/lib/serviceInvoiceTracker/sheet.ts');
const proj = { a: 'Contracted', b: '', c: 46348, e: 'MEDICAL CENTER PARANAQUE', h: 'PMS FOR THE MONTH OF NOVEMBER 2026', j: 25000 };
const sampleRows = () => [HEADER, trackerRow('0944', { 0: 'Contracted', 2: 46024, 4: 'X', 7: 'Y', 9: 6500 }), trackerRow('1801'), trackerRow('1805'), trackerRow('1805'), trackerRow('1806', { 7: '=A1' }), trackerRow('1807'), ['', '', '', '', '']];

test('readTrackerSnapshot rejects changed headers', async () => {
  const m = sheetModule();
  const rows = sampleRows(); rows[0] = [...HEADER]; rows[0][7] = 'Item';
  await assert.rejects(m.readTrackerSnapshot(fakeSheets({ rows }).sheets), { message: 'Service Invoice tracker headers changed; sync stopped to protect its data.' });
});

test('readTrackerSnapshot resolves the tab by sheet ID, FORMULA render', async () => {
  const m = sheetModule();
  const { sheets, calls } = fakeSheets({ rows: sampleRows() });
  const snap = await m.readTrackerSnapshot(sheets);
  assert.equal(snap.sheetId, 449964054);
  assert.equal(snap.title, "'Service Invoice'");
  assert.equal(calls[0][1].valueRenderOption, 'FORMULA');
  assert.ok(snap.directoryNames.has('MEDICAL CENTER PARANAQUE'));
});

test('planRow finds placeholder by normalized D; firstAppendRow after last D', async () => {
  const m = sheetModule();
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows: sampleRows() }).sheets);
  const out = m.planRow(snap, '1801', proj, undefined, () => 99);
  assert.equal(out.kind, 'write');
  assert.equal(out.row.rowNumber, 3);
  assert.equal(out.row.appended, false);
  assert.equal(out.changed, true);
  assert.deepEqual(out.row.cells, ['Contracted', '', 46348, 'MEDICAL CENTER PARANAQUE', 'PMS FOR THE MONTH OF NOVEMBER 2026', 25000]);
  assert.equal(m.firstAppendRow(snap), 8);
});

test('planRow: duplicate D is needs_review and does not block other invoices', async () => {
  const m = sheetModule();
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows: sampleRows() }).sheets);
  const dup = m.planRow(snap, '1805', proj, undefined, () => 99);
  assert.equal(dup.kind, 'needs_review'); assert.match(dup.reason, /duplicate/i);
  assert.equal(m.planRow(snap, '1807', proj, undefined, () => 99).kind, 'write');
});

test('planRow: missing number is appended at nextAppendRow', async () => {
  const m = sheetModule();
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows: sampleRows() }).sheets);
  const out = m.planRow(snap, '1844', proj, undefined, () => 8);
  assert.equal(out.kind, 'write'); assert.equal(out.row.appended, true); assert.equal(out.row.rowNumber, 8);
});

test('planRow: formula in an owned cell is needs_review', async () => {
  const m = sheetModule();
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows: sampleRows() }).sheets);
  const out = m.planRow(snap, '1806', proj, undefined, () => 99);
  assert.equal(out.kind, 'needs_review'); assert.match(out.reason, /formula/i);
});

test('planRow: hand-filled row is needs_review; unchanged owned row is changed=false', async () => {
  const m = sheetModule();
  const rows = sampleRows(); rows[2] = trackerRow('1801', { 0: 'Contracted', 2: 46348, 4: 'MEDICAL CENTER PARANAQUE', 7: 'PMS FOR THE MONTH OF NOVEMBER 2026', 9: 25000 });
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows }).sheets);
  assert.equal(m.planRow(snap, '1801', proj, undefined, () => 99).kind, 'needs_review');
  const owned = m.planRow(snap, '1801', proj, ['Contracted', '', 46348, 'MEDICAL CENTER PARANAQUE', 'PMS FOR THE MONTH OF NOVEMBER 2026', 25000], () => 99);
  assert.equal(owned.kind, 'write'); assert.equal(owned.changed, false);
});

test('planRow: blank F/G gets lookups; manual F/G is needs_review', async () => {
  const m = sheetModule();
  const rows = sampleRows(); rows[2][5] = ''; rows[2][6] = ''; rows[6][5] = '123-456';
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows }).sheets);
  const out = m.planRow(snap, '1801', proj, undefined, () => 99);
  assert.equal(out.row.fillLookups, true);
  const manual = m.planRow(snap, '1807', proj, undefined, () => 99);
  assert.equal(manual.kind, 'needs_review'); assert.match(manual.reason, /manual TIN\/address/);
});

test('applyTrackerWrites: directory append first, then one batchUpdate of owned cells only', async () => {
  const m = sheetModule();
  const { sheets, calls } = fakeSheets({ rows: sampleRows() });
  const snap = await m.readTrackerSnapshot(sheets);
  const cells = ['Service', '4000251405', 46348, 'GRACE DIALYSIS CENTER  SHAW', 'A\nB', 19500];
  await m.applyTrackerWrites(sheets, snap, [{ invoiceNo: '1801', rowNumber: 3, appended: false, cells }, { invoiceNo: '1844', rowNumber: 8, appended: true, cells: ['', 'CANCELLED', 46348, 'X', 'Y', ''] }],
    [{ name: 'GRACE DIALYSIS CENTER  SHAW', tin: 'NULL', address: 'SHAW BLVD' }]);
  const kinds = calls.map(c => c[0]);
  assert.deepEqual(kinds, ['batchGet', 'append', 'batchUpdate']);
  assert.equal(calls[1][1].range, "'Client Directory'!A:G");
  assert.deepEqual(calls[1][1].requestBody.values, [['', 'GRACE DIALYSIS CENTER  SHAW', '', '', '', '', 'SHAW BLVD']]);
  const requests = calls[2][1].requestBody.requests;
  const updates = requests.filter(r => r.updateCells).map(r => r.updateCells);
  for (const u of updates) {
    assert.equal(u.range.sheetId, 449964054);
    const cols = Array.from({ length: u.range.endColumnIndex - u.range.startColumnIndex }, (_, i) => u.range.startColumnIndex + i);
    for (const c of cols) assert.ok([0, 1, 2, 3, 4, 7, 9].includes(c), `wrote column ${c}`);
    if (u.range.startColumnIndex === 3) assert.equal(u.range.startRowIndex, 7, 'D only on appended row');
  }
  const row3 = updates.filter(u => u.range.startRowIndex === 2);
  const flat = row3.flatMap(u => u.rows[0].values.map((v, i) => [u.range.startColumnIndex + i, v.userEnteredValue]));
  assert.deepEqual(Object.fromEntries(flat), { 0: { stringValue: 'Service' }, 1: { stringValue: '4000251405' }, 2: { numberValue: 46348 }, 4: { stringValue: 'GRACE DIALYSIS CENTER  SHAW' }, 7: { stringValue: 'A\nB' }, 9: { numberValue: 19500 } });
  const d = updates.find(u => u.range.startColumnIndex === 3);
  assert.deepEqual(d.rows[0].values[0].userEnteredValue, { stringValue: '1844' });
  const pastes = requests.filter(r => r.copyPaste).map(r => r.copyPaste);
  assert.deepEqual(pastes.map(p => [p.pasteType, p.destination.startRowIndex, p.source.startRowIndex, p.source.startColumnIndex, p.source.endColumnIndex]).sort(),
    [['PASTE_DATA_VALIDATION', 7, 1, 0, 10], ['PASTE_FORMAT', 7, 1, 0, 10], ['PASTE_NORMAL', 7, 1, 5, 7]].sort());
  const row8 = Object.fromEntries(updates.filter(u => u.range.startRowIndex === 7).flatMap(u => u.rows[0].values.map((v, i) => [u.range.startColumnIndex + i, v.userEnteredValue])));
  assert.deepEqual(row8[0], {}); assert.deepEqual(row8[9], {});
});

test('applyTrackerWrites: D padded to 4 digits; nothing to write sends nothing', async () => {
  const m = sheetModule();
  const { sheets, calls } = fakeSheets({ rows: sampleRows() });
  const snap = await m.readTrackerSnapshot(sheets);
  await m.applyTrackerWrites(sheets, snap, [], []);
  assert.deepEqual(calls.map(c => c[0]), ['batchGet']);
  await m.applyTrackerWrites(sheets, snap, [{ invoiceNo: '999', rowNumber: 8, appended: true, cells: ['', '', 1, '', '', ''] }], []);
  const d = calls[1][1].requestBody.requests.find(r => r.updateCells && r.updateCells.range.startColumnIndex === 3);
  assert.deepEqual(d.updateCells.rows[0].values[0].userEnteredValue, { stringValue: '0999' });
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

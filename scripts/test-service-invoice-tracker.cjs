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
const SOURCE_ID = '14G57IKQ73FCxjZyba216vZlsbsqPYsgPGsjVKzcyzwY';
const DIR_HEADER = ['', 'Company Name', 'Contact Person', 'Contact Number', 'Email Address', 'TIN', 'Address'];
const directoryValues = (directory) => [DIR_HEADER, ...directory.map(([name]) => ['3/6/2021', name, '', '', '', '', ''])];
function fakeSheets({ rows, directory = [['MEDICAL CENTER PARANAQUE']], directoryHeader }) {
  const calls = [];
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 1, title: 'Other', gridProperties: { rowCount: 5 } } }, { properties: { sheetId: 449964054, title: 'Service Invoice', gridProperties: { rowCount: 1483 } } }] } }),
    values: {
      batchGet: async (req) => { calls.push(['batchGet', req]); return { data: { valueRanges: [{ values: rows }] } }; },
      // Client Directory B is a spilled formula: FORMULA render returns no names.
      get: async (req) => { calls.push(['dirGet', req]); assert.equal(req.spreadsheetId, SOURCE_ID); const values = directoryValues(directory); if (directoryHeader) values[0] = directoryHeader; return { data: { values } }; },
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

test('readTrackerSnapshot rejects a changed source directory header', async () => {
  const m = sheetModule();
  await assert.rejects(m.readTrackerSnapshot(fakeSheets({ rows: sampleRows(), directoryHeader: ['', 'Client', '', '', '', 'TIN', 'Address'] }).sheets), /Client Directory headers changed/);
});

test('readTrackerSnapshot reports directory row count for the 500-row import cap', async () => {
  const m = sheetModule();
  const snap = await m.readTrackerSnapshot(fakeSheets({ rows: sampleRows(), directory: [['A'], ['B']] }).sheets);
  assert.equal(snap.directoryRowCount, 3);
  assert.equal(m.DIRECTORY_IMPORT_ROWS, 500);
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
  assert.deepEqual(kinds, ['batchGet', 'dirGet', 'append', 'batchUpdate']);
  assert.equal(calls[2][1].spreadsheetId, SOURCE_ID, 'appends to SALES ORDER TRACKER, never the tracker copy');
  assert.equal(calls[2][1].range, "'Client Directory'!A:G");
  assert.deepEqual(calls[2][1].requestBody.values, [['', 'GRACE DIALYSIS CENTER  SHAW', '', '', '', '', 'SHAW BLVD']]);
  const requests = calls[3][1].requestBody.requests;
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
  assert.deepEqual(calls.map(c => c[0]), ['batchGet', 'dirGet']);
  await m.applyTrackerWrites(sheets, snap, [{ invoiceNo: '999', rowNumber: 8, appended: true, cells: ['', '', 1, '', '', ''] }], []);
  const d = calls[2][1].requestBody.requests.find(r => r.updateCells && r.updateCells.range.startColumnIndex === 3);
  assert.deepEqual(d.updateCells.rows[0].values[0].userEnteredValue, { stringValue: '0999' });
});

// ---------- Task 3: sync orchestration ----------
const TRACKER_ID = '1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A';
function syncWorld({ trackerRows, dbRows, summaries, directory = [['MEDICAL CENTER PARANAQUE']], companies = [], soItems = [], failApply = false, failRead = false }) {
  const calls = [];
  const db = { rows: dbRows };
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 449964054, title: 'Service Invoice', gridProperties: { rowCount: 1483 } } }] } }),
    batchUpdate: async (req) => { calls.push(['trackerBatchUpdate', req]); if (failApply) throw new Error('Quota exceeded'); },
    values: {
      get: async (req) => {
        if (req.spreadsheetId === SOURCE_ID) return { data: { values: directoryValues(directory) } };
        assert.equal(req.spreadsheetId, 'db'); calls.push(['dbGet', req.range]); return { data: { values: db.rows } };
      },
      batchGet: async (req) => {
        if (req.spreadsheetId === TRACKER_ID) { calls.push(['trackerRead']); if (failRead) throw new Error('Sheets unavailable'); return { data: { valueRanges: [{ values: trackerRows }] } }; }
        return { data: { valueRanges: req.ranges.map(range => ({ values: [[db.rows[Number(range.match(/T(\d+)$/)[1]) - 1][19] ?? '']] })) } };
      },
      append: async (req) => { calls.push(['append', req]); },
      batchUpdate: async (req) => {
        calls.push(['dbWrite', req]);
        for (const entry of req.requestBody.data) db.rows[Number(entry.range.match(/T(\d+)$/)[1]) - 1][19] = entry.values[0][0];
      },
    },
  } };
  const mocks = {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'db' },
    '@/lib/serviceInvoiceSheets': { getServiceInvoices: async () => summaries() },
    '@/lib/companySheets': { getCompanies: async () => companies },
    '@/lib/salesOrders/repository': { readSalesOrderItemsAll: async () => soItems },
  };
  return { calls, db, sync: load('src/lib/serviceInvoiceTracker/sync.ts', mocks) };
}
const dbRow = (no, status, meta = {}) => { const r = Array(20).fill(''); r[0] = no; r[8] = status; r[19] = JSON.stringify({ billingMode: 'REGULAR', discountData: { discountAmount: 0 }, ...meta }); return r; };
const summary = (no, extra = {}) => ({ invoiceNo: no, status: 'created', date: '2026-11-22', companyName: 'MEDICAL CENTER PARANAQUE', items: [item('PMS FOR THE MONTH OF NOVEMBER 2026', 25000)], ...extra });
function worldRows() {
  return [HEADER, trackerRow('1800'), trackerRow('1801'), trackerRow('1809', { 0: 'Contracted', 2: 46333, 4: 'IRENE PEDRO', 7: 'PMS FOR THE MONTH OF NOVEMBER 2026', 9: 7000 }), trackerRow('1842')];
}
function worldDb() { return [Array(20).fill('H'), dbRow('1800', 'created'), dbRow('1801', 'created'), dbRow('1809', 'created'), dbRow('1843', 'created'), dbRow('DRAFT-1', 'draft')]; }

test('sync batch: scope, added/needs_review/appended, metadata merge', async () => {
  const sums = [summary('1800'), summary('1801'), summary('1809', { companyName: 'IRENE PEDRO' }), summary('1843', { contractId: 'CTR-0039' }), summary('DRAFT-1', { status: 'draft' })];
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => sums });
  const report = await w.sync.syncServiceInvoicesToTracker();
  const byNo = Object.fromEntries(report.results.map(r => [r.invoiceNo, r]));
  assert.deepEqual(Object.keys(byNo).sort(), ['1801', '1809', '1843']);
  assert.equal(byNo['1801'].outcome, 'added'); assert.equal(byNo['1801'].row, 3);
  assert.equal(byNo['1809'].outcome, 'needs_review'); assert.match(byNo['1809'].reason, /by hand/);
  assert.equal(byNo['1843'].outcome, 'added'); assert.equal(byNo['1843'].row, 6);
  const meta = JSON.parse(w.db.rows[2][19]);
  assert.equal(meta.billingMode, 'REGULAR'); assert.deepEqual(meta.discountData, { discountAmount: 0 });
  assert.equal(meta.trackerSync.status, 'synced'); assert.equal(meta.trackerSync.row, 3);
  assert.deepEqual(meta.trackerSync.values, ['Service', '', 46348, 'MEDICAL CENTER PARANAQUE', 'PMS FOR THE MONTH OF NOVEMBER 2026', 25000]);
  assert.equal(JSON.parse(w.db.rows[1][19]).trackerSync, undefined, '1800 untouched');
  assert.equal(JSON.parse(w.db.rows[3][19]).trackerSync, undefined, 'needs_review leaves metadata');
  assert.equal(w.calls.filter(c => c[0] === 'trackerBatchUpdate').length, 1);
});

test('sync: missing customer added to directory once, with company TIN/address', async () => {
  const sums = [summary('1801', { companyName: 'GREEN CITY MEDICAL CENTER' }), summary('1843', { companyName: 'GREEN CITY MEDICAL CENTER' })];
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => sums, companies: [{ companyId: 'C1', companyName: 'GREEN CITY MEDICAL CENTER', tin: '123', address: 'SAN FERNANDO' }] });
  const report = await w.sync.syncServiceInvoicesToTracker();
  assert.deepEqual(report.customersAdded, ['GREEN CITY MEDICAL CENTER']);
  const appends = w.calls.filter(c => c[0] === 'append');
  assert.equal(appends.length, 1);
  assert.deepEqual(appends[0][1].requestBody.values, [['', 'GREEN CITY MEDICAL CENTER', '', '', '', '123', 'SAN FERNANDO']]);
});

test('sync: directory import full -> needs_review, nothing appended', async () => {
  const full = Array.from({ length: 499 }, (_, i) => ['CUSTOMER ' + i]);
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => [summary('1801', { companyName: 'GREEN CITY MEDICAL CENTER' }), summary('1843')], directory: [...full.slice(0, 498), ['MEDICAL CENTER PARANAQUE']] });
  const report = await w.sync.syncServiceInvoicesToTracker();
  const byNo = Object.fromEntries(report.results.map(r => [r.invoiceNo, r]));
  assert.equal(byNo['1801'].outcome, 'needs_review'); assert.match(byNo['1801'].reason, /500-row/);
  assert.equal(byNo['1843'].outcome, 'added');
  assert.equal(w.calls.filter(c => c[0] === 'append').length, 0);
});

test('sync: SO-linked invoice takes SO active lines', async () => {
  const sums = [summary('1801', { salesOrderId: 'so-1470' })];
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => sums, soItems: [
    { salesOrderId: 'so-1470', lineNo: 2, description: 'WATER SOFTENER REBEDDING (16x62)', lineStatus: 'ACTIVE' },
    { salesOrderId: 'so-1470', lineNo: 1, description: 'REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)', lineStatus: 'ACTIVE' },
    { salesOrderId: 'other', lineNo: 1, description: 'NOPE', lineStatus: 'ACTIVE' }] });
  await w.sync.syncServiceInvoicesToTracker(['1801']);
  assert.equal(JSON.parse(w.db.rows[2][19]).trackerSync.values[4], 'REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)\nWATER SOFTENER REBEDDING (16x62)');
});

test('sync twice: second run after an edit is updated, not needs_review', async () => {
  let sums = [summary('1801')];
  const rows = worldRows();
  const w = syncWorld({ trackerRows: rows, dbRows: worldDb(), summaries: () => sums });
  await w.sync.syncServiceInvoicesToTracker(['1801']);
  // the tracker now holds what was written
  Object.assign(rows[2], { 0: 'Service', 2: 46348, 4: 'MEDICAL CENTER PARANAQUE', 7: 'PMS FOR THE MONTH OF NOVEMBER 2026', 9: 25000 });
  sums = [summary('1801', { items: [item('PMS FOR THE MONTH OF NOVEMBER 2026', 26000)] })];
  const second = await w.sync.syncServiceInvoicesToTracker(['1801']);
  assert.equal(second.results[0].outcome, 'updated');
  Object.assign(rows[2], { 9: 26000 });
  const third = await w.sync.syncServiceInvoicesToTracker(['1801']);
  assert.equal(third.results[0].outcome, 'unchanged');
});

test('sync: deleted invoice previously written becomes CANCELLED', async () => {
  const rows = worldRows();
  Object.assign(rows[2], { 0: 'Service', 2: 46348, 4: 'MEDICAL CENTER PARANAQUE', 7: 'PMS', 9: 25000 });
  const dbRows = worldDb();
  dbRows[2] = dbRow('1801', 'deleted', { trackerSync: { status: 'synced', row: 3, syncedAt: 'x', values: ['Service', '', 46348, 'MEDICAL CENTER PARANAQUE', 'PMS', 25000] } });
  const w = syncWorld({ trackerRows: rows, dbRows, summaries: () => [] });
  const report = await w.sync.syncServiceInvoicesToTracker();
  assert.equal(report.results[0].outcome, 'updated');
  assert.deepEqual(JSON.parse(w.db.rows[2][19]).trackerSync.values, ['', 'CANCELLED', 46348, 'MEDICAL CENTER PARANAQUE', 'PMS', '']);
});

test('sync: apply failure marks every planned invoice failed', async () => {
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => [summary('1801'), summary('1843')], failApply: true });
  const report = await w.sync.syncServiceInvoicesToTracker();
  assert.deepEqual(report.results.map(r => [r.invoiceNo, r.outcome]), [['1801', 'failed'], ['1843', 'failed']]);
  assert.equal(JSON.parse(w.db.rows[2][19]).trackerSync.status, 'failed');
  assert.equal(JSON.parse(w.db.rows[2][19]).trackerSync.error, 'Quota exceeded');
});

test('syncServiceInvoiceToTracker never throws; records failed when the tracker cannot be read', async () => {
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => [summary('1801')], failRead: true });
  const original = console.error; console.error = () => {};
  try { await w.sync.syncServiceInvoiceToTracker('1801'); } finally { console.error = original; }
  const meta = JSON.parse(w.db.rows[2][19]);
  assert.equal(meta.trackerSync.status, 'failed'); assert.equal(meta.trackerSync.error, 'Sheets unavailable');
  await assert.rejects(w.sync.syncServiceInvoicesToTracker(), /Sheets unavailable/);
});

test('sync: one invoice with an invalid date fails alone; others still sync', async () => {
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => [summary('1801', { date: '' }), summary('1843')] });
  const report = await w.sync.syncServiceInvoicesToTracker();
  const byNo = Object.fromEntries(report.results.map(r => [r.invoiceNo, r]));
  assert.equal(byNo['1801'].outcome, 'failed'); assert.match(byNo['1801'].reason, /Invalid invoice date/);
  assert.equal(byNo['1843'].outcome, 'added');
  assert.equal(JSON.parse(w.db.rows[2][19]).trackerSync.status, 'failed');
});

test('syncServiceInvoiceToTracker ignores drafts and out-of-scope numbers', async () => {
  const w = syncWorld({ trackerRows: worldRows(), dbRows: worldDb(), summaries: () => [summary('1800'), summary('DRAFT-1', { status: 'draft' })] });
  await w.sync.syncServiceInvoiceToTracker('1800');
  await w.sync.syncServiceInvoiceToTracker('DRAFT-1');
  assert.equal(w.calls.filter(c => c[0] === 'trackerRead').length, 0);
});

test('getServiceInvoices exposes trackerSyncStatus from metadata', async () => {
  const tracking = load('src/lib/serviceInvoiceTracking.ts');
  const filters = load('src/lib/serviceInvoiceFilters.ts', { './serviceInvoiceTracking': tracking, './serviceInvoiceSummary': load('src/lib/serviceInvoiceSummary.ts', { './serviceInvoiceTracking': tracking }) });
  const row = Array(21).fill(''); row[0] = '1801'; row[1] = '2026-11-22'; row[2] = 'C1'; row[8] = 'created';
  row[19] = JSON.stringify({ trackerSync: { status: 'failed', syncedAt: 'x', error: 'boom' } });
  const sheets = { spreadsheets: { values: { get: async ({ range }) => ({ data: { values: /Items/.test(range) ? [] : [Array(21).fill('h'), row] } }) } } };
  const storage = load('src/lib/serviceInvoiceSheets.ts', {
    './serviceInvoiceTracking': tracking,
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'fixture' },
    '@/lib/serviceInvoiceFilters': filters,
    '@/lib/companySheets': { getCompanies: async () => [] },
    '@/lib/salesOrders/repository': { readSalesOrderListSnapshot: async () => ({ orders: [], items: [] }), readSalesOrderById: async () => null },
  });
  const [invoice] = await storage.getServiceInvoices();
  assert.equal(invoice.trackerSyncStatus, 'failed');
});

// ---------- Task 4: routes ----------
function routeWorld({ admin = true, syncRejects = false, batchRejects = false } = {}) {
  const scheduled = [];
  const synced = [];
  const nextServer = { NextResponse: { json: (body, init) => Response.json(body, init) }, after: (fn) => scheduled.push(fn) };
  const session = { userId: 'u1', fullName: 'Chris', userRoleId: admin ? '1' : '2' };
  const sync = {
    syncServiceInvoiceToTracker: async (no) => { synced.push(no); if (syncRejects) throw new Error('boom'); },
    syncServiceInvoicesToTracker: async () => { if (batchRejects) throw new Error('Service Invoice tracker headers changed; sync stopped to protect its data.'); return { results: [{ invoiceNo: '1801', outcome: 'added', row: 859 }], customersAdded: [] }; },
  };
  const auth = { requireAuthenticatedSession: async () => session, isAdminUser: (s) => s.userRoleId === '1' };
  const repo = {
    processServiceInvoice: async (body) => ({ success: true, invoiceNo: body.status === 'draft' ? 'DRAFT-9' : body.invoiceNo, status: body.status || 'created' }),
    updateServiceInvoice: async (no) => ({ success: true, invoiceNo: no, status: 'created' }),
    deleteServiceInvoice: async () => {},
    cancelAndCreateCorrectedServiceInvoice: async () => '1850',
  };
  const mocks = { 'next/server': nextServer, '@/lib/auth/session': auth, '@/lib/serviceInvoiceSheets': repo, '@/lib/serviceInvoiceTracker/sync': sync, '@/lib/userSheets': { getUserById: async () => null }, '@/lib/serviceInvoiceBilling': { InvoiceBillingError: class extends Error {} } };
  const runScheduled = async () => { for (const fn of scheduled.splice(0)) await Promise.resolve(fn()).catch(() => {}); };
  return { scheduled, synced, runScheduled, mocks };
}
const json = (method, body) => new Request('http://test', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (invoiceNo) => ({ params: Promise.resolve({ invoiceNo }) });
const createBody = (extra = {}) => ({ invoiceNo: '1844', customerId: 'C1', date: '2026-11-23', preparedBy: 'Chris', items: [{ description: 'X', quantity: 1, unitPrice: 1 }], ...extra });

test('POST create schedules tracker sync after the save; draft schedules nothing', async () => {
  const w = routeWorld();
  const route = load('src/app/api/service-invoices/route.ts', w.mocks);
  const res = await route.POST(json('POST', createBody()));
  assert.equal(res.status, 201);
  assert.equal(w.scheduled.length, 1);
  await w.runScheduled();
  assert.deepEqual(w.synced, ['1844']);
  await route.POST(json('POST', createBody({ status: 'draft' })));
  assert.equal(w.scheduled.length, 0);
});

test('POST create: failing save schedules nothing; rejecting sync leaves response intact', async () => {
  const w = routeWorld({ syncRejects: true });
  w.mocks['@/lib/serviceInvoiceSheets'].processServiceInvoice = async () => { throw new Error('Invoice No. already exists'); };
  let route = load('src/app/api/service-invoices/route.ts', w.mocks);
  assert.equal((await route.POST(json('POST', createBody()))).status, 500);
  assert.equal(w.scheduled.length, 0);
  const ok = routeWorld({ syncRejects: true });
  route = load('src/app/api/service-invoices/route.ts', ok.mocks);
  const res = await route.POST(json('POST', createBody()));
  assert.equal(res.status, 201);
  assert.equal((await res.json()).invoiceNo, '1844');
  await ok.runScheduled();
  assert.deepEqual(ok.synced, ['1844']);
});

test('PUT and DELETE schedule sync for the invoice', async () => {
  const w = routeWorld();
  const route = load('src/app/api/service-invoices/[invoiceNo]/route.ts', w.mocks);
  assert.equal((await route.PUT(json('PUT', { items: [] }), ctx('1801'))).status, 200);
  assert.equal((await route.DELETE(new Request('http://test', { method: 'DELETE' }), ctx('1802'))).status, 200);
  await w.runScheduled();
  assert.deepEqual(w.synced, ['1801', '1802']);
});

test('corrected copy schedules both original and replacement', async () => {
  const w = routeWorld();
  const route = load('src/app/api/service-invoices/[invoiceNo]/corrected-copy/route.ts', w.mocks);
  assert.equal((await route.POST(json('POST', { reason: 'wrong amount' }), ctx('1801'))).status, 200);
  await w.runScheduled();
  assert.deepEqual(w.synced, ['1801', '1850']);
});

test('tracker-sync route: admin gets report, non-admin 403, batch error 500', async () => {
  let w = routeWorld();
  let route = load('src/app/api/service-invoices/tracker-sync/route.ts', w.mocks);
  let res = await route.POST(new Request('http://test', { method: 'POST' }));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).results[0], { invoiceNo: '1801', outcome: 'added', row: 859 });
  w = routeWorld({ admin: false });
  route = load('src/app/api/service-invoices/tracker-sync/route.ts', w.mocks);
  res = await route.POST(new Request('http://test', { method: 'POST' }));
  assert.equal(res.status, 403); assert.deepEqual(await res.json(), { error: 'Admin access required.' });
  w = routeWorld({ batchRejects: true });
  route = load('src/app/api/service-invoices/tracker-sync/route.ts', w.mocks);
  res = await route.POST(new Request('http://test', { method: 'POST' }));
  assert.equal(res.status, 500); assert.match((await res.json()).error, /headers changed/);
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

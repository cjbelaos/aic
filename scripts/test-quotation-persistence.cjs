/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');

function fixture(initial = [], options = {}) {
  let header = options.header || Array(27).fill('');
  let columnCount = options.columnCount || 27;
  let rows = initial.map(row => [...row]);
  const writes = [], archives = [], locks = [];
  const checkRange = range => {
    if (!range.startsWith('Quotations!')) return;
    const end = range.split(':')[1]?.match(/^[A-Z]+/)?.[0];
    if (!end) return;
    const index = [...end].reduce((sum, c) => sum * 26 + c.charCodeAt(0) - 64, 0);
    if (index > columnCount) throw new Error(`Range exceeds ${columnCount} column grid: ${range}`);
  };
  const values = {
    get: async ({ range }) => { checkRange(range); return { data: { values: range.includes('1:') ? [header.slice(21)] : rows } }; },
    batchGet: async ({ ranges }) => { ranges.forEach(checkRange); return { data: { valueRanges: [{ values: rows }, { values: [] }, { values: [] }] } }; },
    update: async args => { writes.push(args); if (/!A\d+$/.test(args.range)) rows[Number(args.range.match(/A(\d+)$/)[1]) - 2] = args.requestBody.values[0]; return { data: {} }; },
    append: async args => { writes.push(args); if (args.range.startsWith('Quotations!')) rows.push(args.requestBody.values[0]); return { data: {} }; },
    batchUpdate: async args => { writes.push(args); return { data: {} }; },
  };
  const sheets = { spreadsheets: { values, get: async () => ({ data: { sheets: [{ properties: { title: 'Quotations', sheetId: 1, gridProperties: { columnCount } } }] } }), batchUpdate: async args => { writes.push(args); for (const request of args.requestBody.requests) { if (request.appendDimension?.dimension === 'COLUMNS') columnCount += request.appendDimension.length; } return { data: {} }; } } };
  const load = createLoader({
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'test' },
    '@/lib/quotationHistory': { getQuotationHistory: async () => options.history || [], preserveLegacyQuotation: async q => { archives.push(q); if (options.archiveError) throw new Error("Archive unavailable"); } },
    '@/lib/quotationLock': { withQuotationLock: async (id, fn) => { locks.push(id); return fn(); }, assertQuotationUnlocked: async () => {} },
    '@/lib/sheetChildRows': { replaceChildRowsInPlace: async () => {} },
  });
  const api = load('src/lib/quotationSheets.ts');
  const { quotationRowValues } = load('src/lib/quotationRow.ts');
  return { api, quotationRowValues, writes, archives, locks, rows: () => rows };
}
const base = { quotationNo: 'Q-20261104-001', customer: 'Test', description: 'Work', date: '2026-11-04', items: [], notation: [], amount: 100, discount: 0, file: '', preparedBy: 'User', approvedBy: '', sentBy: '', status: 'SAVED', terms: 'Cash', delivery: '7 days', warranty: 'No warranty' };
async function rejects(promise, pattern) {
  const originalError = console.error; console.error = () => {};
  try { await assert.rejects(promise, pattern); } finally { console.error = originalError; }
}
(async () => {
  let f = fixture();
  await rejects(f.api.addQuotation({ ...base, terms: '  ' }, 'tester'), /payment/i);
  assert.equal(f.writes.length, 0, 'Invalid save must not write schema or rows');
  await rejects(f.api.addQuotation({ ...base, status: 'SENT' }, 'tester'), /send/i);
  await rejects(f.api.addQuotation({ ...base, status: 'DRAFT', delivery: ' ' }, 'tester'), /delivery/i);
  await rejects(f.api.addQuotation({ ...base, status: 'DRAFT', warranty: ' ' }, 'tester'), /warranty/i);
  assert.equal(f.writes.length, 0);
  const created = await f.api.addQuotation(base, 'tester');
  assert.equal(created.delivery, base.delivery); assert.equal(created.warranty, 'No warranty');
  const reopened = await f.api.getQuotationByRefNo(base.quotationNo);
  assert.equal(reopened.delivery, base.delivery); assert.equal(reopened.warranty, 'No warranty');
  await rejects(f.api.addQuotation(base, 'tester'), /already|exists/i);

  const source = f.quotationRowValues({ quotationNo: base.quotationNo, customer: 'Test', paymentTerms: 'Cash', delivery: '7 days', warranty: 'No warranty', file: 'old-pdf', status: 'SENT', updatedAt: 'old', revision: 2, lastSentAt: 'sent-time' });
  f = fixture([source.slice(0, 26)], { columnCount: 26 });
  const legacyList = await f.api.getQuotations();
  assert.equal(legacyList[0].quotationNo, base.quotationNo);
  assert.equal((await f.api.getQuotationByRefNo(base.quotationNo)).terms, 'Cash');
  assert.equal(f.writes.length, 0, 'Legacy GET must not initialize the schema');
  for (const state of ['SENDING', 'UNCERTAIN']) {
    const saved = [...source]; saved[16] = 'SAVED'; saved[24] = 0; saved[25] = false; saved[26] = '';
    f = fixture([saved], { history: [{ state }] });
    await rejects(f.api.deleteQuotationByRefNo(base.quotationNo), /history|send|delivery/i);
    assert.equal(f.writes.length, 0, `Deletion with ${state} history must not change rows`);
  }
  f = fixture([source]);
  const updated = await f.api.updateQuotation(base.quotationNo, { ...base, updatedAt: 'old', revision: 99, lastSentAt: 'fake', file: 'fake', quotationNo: 'Q-OTHER' }, 'tester');
  assert.equal(updated.quotationNo, base.quotationNo, 'Issued number cannot be changed');
  assert.equal(updated.revision, 2); assert.equal(updated.revisionPending, true); assert.equal(updated.lastSentAt, 'sent-time');
  assert.equal(updated.status, 'SAVED'); assert.equal(updated.file, 'old-pdf');
  assert.equal(f.archives.length, 1); assert.equal(f.archives[0].revision, 2); assert.equal(f.archives[0].file, 'old-pdf');
  assert.ok(f.locks.includes(base.quotationNo));
  await rejects(f.api.updateQuotation(base.quotationNo, { ...base, updatedAt: 'old' }, 'tester'), /changed|stale|reload/i);
  await rejects(f.api.updateQuotationStatus(base.quotationNo, 'SENT', 'tester'), /send/i);
  await rejects(f.api.updateQuotationStatus(base.quotationNo, 'DRAFT', 'tester'), /revise|sent/i);
  await rejects(f.api.updateQuotation(base.quotationNo, { ...base, terms: '' }, 'tester'), /payment/i);
  await rejects(f.api.deleteQuotationByRefNo(base.quotationNo), /sent|history|revision/i);

  f = fixture([source], { archiveError: true });
  await rejects(f.api.updateQuotation(base.quotationNo, { ...base, updatedAt: 'old' }, 'tester'), /archive/i);
  assert.equal(f.writes.some(write => write.requestBody?.values), false, 'Archive failure must not mutate quotation rows');
  const badHeader = Array(27).fill(''); badHeader[22] = 'Unrelated field';
  f = fixture([], { header: badHeader });
  await rejects(f.api.ensureQuotationColumns(), /unexpected header/i);
  assert.equal(f.writes.length, 0, 'Unknown additive header must not be overwritten');
  f = fixture([], { columnCount: 26 });
  await f.api.ensureQuotationColumns();
  assert.equal(f.writes[0].requestBody.requests[0].appendDimension.length, 1);
  assert.ok(f.writes[1].requestBody.requests.every(request => request.updateCells.range.startColumnIndex >= 21));
  f = fixture();
  await rejects(f.api.saveQuotationData({ clientName: 'Test', quotationNo: 'Q-NEW', quotationDescription: 'Work', status: 'DRAFT', items: [], notations: [], terms: '' }, 'tester'), /payment/i);
  assert.equal(f.writes.length, 0);
  console.log('Quotation persistence tests passed: required terms, round trip, immutable sent metadata, archived revision, stale edits, send bypass, duplicate create, history deletion guard.');
})().catch(error => { console.error(error); process.exitCode = 1; });

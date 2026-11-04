/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');
async function main() {
  let header = ['SendId', 'QuotationNo', 'Revision', 'State', 'File', 'SnapshotJSON', 'SentBy', 'Recipient', 'SentAt', 'MessageId', 'Error', 'SnapshotToken'], rows = [], batches = [], copied = 0;
  const sheetNames = [{ properties: { title: 'Quotations', sheetId: 7 } }, { properties: { title: 'QuotationHistory', sheetId: 8 } }];
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: sheetNames } }),
    values: {
      get: async ({ range }) => ({ data: { values: range === 'QuotationHistory!A1:L1' ? (header.length ? [header] : []) : range === 'Quotations!A2:A' ? [['Q-1']] : structuredClone(rows) } }),
      update: async ({ range, requestBody }) => { if (range === 'QuotationHistory!A1:L1') header = requestBody.values[0]; else { const row = Number(range.match(/A(\d+)/)[1]) - 2; rows[row] = structuredClone(requestBody.values[0]); } },
      append: async ({ requestBody }) => { rows.push(...structuredClone(requestBody.values)); },
    },
    batchUpdate: async ({ requestBody }) => { batches.push(requestBody.requests); },
  } };
  const load = createLoader({
    '@/lib/googleSheets': { getDatabaseSpreadsheetId: async () => 'test', getSheetsClient: async () => sheets },
    '@/lib/quotationPdfStorage': { copyLegacyQuotationPdf: async q => { copied++; assert.equal(q.file, 'original.pdf'); return 'immutable-copy.pdf'; } },
    '@/lib/quotationSheets': { ensureQuotationColumns: async () => {} },
  });
  const history = load('src/lib/quotationHistory.ts');
  const q = { quotationNo: 'Q-1', status: 'SENT', file: 'original.pdf', terms: '', delivery: '', warranty: '', items: [], notation: [], sentBy: 'original-sender', amount: 100, discount: 0, date: '', customer: 'Test', preparedBy: '', approvedBy: '' };
  await history.preserveLegacyQuotation(q); await history.preserveLegacyQuotation(q);
  assert.equal(copied, 1); assert.equal(rows.length, 1); assert.equal(rows[0][3], 'LEGACY'); assert.equal(rows[0][4], 'immutable-copy.pdf'); assert.equal(JSON.parse(rows[0][5]).terms, ''); assert.equal(rows[0][8], '', 'Unknown legacy send time must not be invented');
  await assert.rejects(history.saveQuotationHistoryAttempt({ ...(await history.getQuotationHistory('Q-1'))[0], file: 'overwrite.pdf' }), /cannot be replaced/);
  const attempt = { sendId: 'send-1234567890123456', quotationNo: 'Q-1', revision: 1, state: 'SENDING', file: 'revision1.pdf', snapshot: { ...q, revision: 1, terms: 'Cash', delivery: 'On site', warranty: 'No warranty' }, sentBy: 'new-sender', recipient: 'test@example.test', sentAt: '', messageId: '', error: '', snapshotToken: 'token' };
  await history.saveQuotationHistoryAttempt(attempt); assert.equal(rows.length, 2);
  const sent = { ...attempt, state: 'SENT', sentAt: '2026-11-04T07:00:00Z', messageId: 'message' };
  await history.completeQuotationSend(sent);
  const final = batches.at(-1); assert.equal(final.length, 5, 'Send history and quotation metadata complete in one batch');
  const entry = final[0].updateCells; assert.equal(entry.start.sheetId, 8); assert.equal(entry.rows[0].values[3].userEnteredValue.stringValue, 'SENT');
  const revision = final[4].updateCells; assert.equal(revision.start.columnIndex, 24); assert.equal(revision.rows[0].values[0].userEnteredValue.numberValue, 1); assert.equal(revision.rows[0].values[1].userEnteredValue.boolValue, false);
  assert.equal(rows[0][4], 'immutable-copy.pdf');
  const before = rows.length;
  await assert.rejects(history.saveQuotationHistoryAttempt({ ...attempt, sendId: 'too-large', snapshot: { ...attempt.snapshot, description: 'x'.repeat(49000) } }), /too much text/); assert.equal(rows.length, before);
  console.log('Quotation history tests passed: legacy PDF preservation, immutable archives, snapshot size limits and atomic sent completion.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

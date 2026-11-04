/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');
async function main() {
  const pure = createLoader();
  const { quotationTermsError } = pure('src/lib/quotationTerms.ts');
  const { quotationSnapshotToken, quotationDisplayRevision, quotationRevisionLabel } = pure('src/lib/quotationRevision.ts');
  for (const terms of ['', '   ', undefined, 42]) assert.match(quotationTermsError({ terms }), /Payment terms/i);
  assert.match(quotationTermsError({ terms: 'Cash' }), /Delivery/i);
  assert.match(quotationTermsError({ terms: 'Cash', delivery: '7 days', warranty: ' ' }), /Warranty/i);
  assert.match(quotationTermsError({ terms: 'Cash' }, true), /Delivery/i);
  assert.match(quotationTermsError({ terms: 'Cash', delivery: 'On site' }, true), /Warranty/i);
  assert.equal(quotationTermsError({ terms: 'Cash', delivery: 'On site', warranty: 'No warranty' }, true), '');
  const base = { id: 'quot_2', quotationNo: 'Q-20261104-002', customer: 'Test client', customerId: 'COMP-1', description: 'Repair', amount: 100, discount: 0, items: [{ quotationNo: 'Q-20261104-002', description: 'Work', quantity: 1, unit: 'LOT', unitPrice: 100 }], notation: [], terms: 'Cash', delivery: 'On site', warranty: 'No warranty', date: '2026-11-04', preparedBy: 'Tester', approvedBy: '', sentBy: '', status: 'SAVED', file: '', updatedAt: 'v1', revision: 0, revisionPending: false };
  assert.equal(quotationDisplayRevision(base), 0);
  assert.equal(quotationDisplayRevision({ ...base, revisionPending: true }), 1);
  assert.equal(quotationRevisionLabel({ ...base, revisionPending: true }), 'Q-20261104-002 — Revision 1');
  assert.notEqual(quotationSnapshotToken(base), quotationSnapshotToken({ ...base, terms: '30 days' }));
  assert.equal(quotationSnapshotToken(base), quotationSnapshotToken({ ...base, file: 'new.pdf' }));
  let current = structuredClone(base), history = [], locked = false, deliveries = 0, pdfs = [], failure = '', failComplete = false;
  const historyMock = {
    getQuotationHistory: async number => structuredClone(history.filter(e => e.quotationNo === number)),
    preserveLegacyQuotation: async () => {},
    saveQuotationHistoryAttempt: async entry => { const index = history.findIndex(e => e.sendId === entry.sendId); if (index < 0) history.push(structuredClone(entry)); else history[index] = structuredClone(entry); },
    completeQuotationSend: async entry => { if (failComplete) throw Error('Storage unavailable after mail'); history[history.findIndex(e => e.sendId === entry.sendId)] = structuredClone(entry); current = { ...current, status: 'SENT', revision: entry.revision, revisionPending: false, lastSentAt: entry.sentAt, file: entry.file }; },
  };
  let contacts = [{ companyId: 'COMP-1', email: 'test@example.test', isPrimary: true }, { companyId: 'COMP-1', email: 'other@example.test', isPrimary: false }];
  const cc = ['other@example.test', 'sales.aerichinnovationcorp@gmail.com'];
  const load = createLoader({
    '@/lib/companyContactSheets': { getCompanyContacts: async () => contacts },
    '@/lib/quotationSheets': { getQuotationByRefNo: async () => structuredClone(current) },
    '@/lib/quotationHistory': historyMock,
    '@/lib/quotationPdfStorage': { createQuotationPdf: async () => { const file = `pdf-${pdfs.length + 1}`; pdfs.push(file); return file; } },
    '@/lib/quotationLock': { withQuotationLock: async (_number, action) => { if (locked) throw Error('Another quotation operation'); locked = true; try { return await action(); } finally { locked = false; } } },
  });
  const { sendQuotationVersion } = load('src/lib/quotationSending.ts');
  const request = () => ({ quotationNo: current.quotationNo, sendId: '11111111-1111-4111-8111-111111111111', snapshotToken: quotationSnapshotToken(current), recipient: 'test@example.test', cc, actor: 'tester', pdfBuffer: Buffer.from('%PDF-1.4\nTest') });
  const deliver = async (q, label) => { deliveries++; assert.equal(q.warranty, 'No warranty'); assert.ok(label.startsWith(base.quotationNo)); if (failure) { const e = Error(failure); if (failure === 'Rejected') e.responseCode = 550; throw e; } return { messageId: 'message1', accepted: ['test@example.test', ...cc] }; };
  let input = request();
  await assert.rejects(sendQuotationVersion({ ...input, cc: [] }, deliver), /contacts|recipient/i);
  assert.equal(pdfs.length, 0, 'Reject changed/unreviewed recipients before archiving');
  const validContacts = contacts; contacts = [];
  await assert.rejects(sendQuotationVersion(input, deliver), /primary/i);
  contacts = [{ ...validContacts[0], email: '' }];
  await assert.rejects(sendQuotationVersion(input, deliver), /primary.*email/i);
  contacts = validContacts;
  assert.equal(deliveries, 0); assert.equal(pdfs.length, 0);
  const first = await sendQuotationVersion(input, deliver);
  assert.equal(first.revision, 0); assert.equal(current.status, 'SENT'); assert.equal(history[0].state, 'SENT'); assert.equal(history[0].snapshot.warranty, 'No warranty');
  assert.deepEqual(history[0].snapshot.emailRecipients, { to: input.recipient, cc });
  await assert.rejects(sendQuotationVersion({ ...input, cc: [] }, deliver), /different|reused/i);
  await sendQuotationVersion(input, deliver); assert.equal(deliveries, 1, 'Success retry must not email twice');
  await assert.rejects(sendQuotationVersion({ ...input, recipient: 'other@example.test' }, deliver), /different|reused/i);
  current = { ...current, terms: '30 days', updatedAt: 'v2', status: 'SAVED', revisionPending: true };
  const oldSnapshot = structuredClone(history[0]);
  await assert.rejects(sendQuotationVersion({ ...request(), sendId: '22222222-2222-4222-8222-222222222222', snapshotToken: input.snapshotToken }, deliver), /changed|latest|stale/i);
  input = { ...request(), sendId: '22222222-2222-4222-8222-222222222222' };
  failure = 'Rejected'; await assert.rejects(sendQuotationVersion(input, deliver), /Rejected/); assert.equal(current.revision, 0); assert.equal(history[1].state, 'FAILED');
  failure = ''; const revised = await sendQuotationVersion(input, deliver); assert.equal(revised.revision, 1); assert.equal(current.revision, 1); assert.deepEqual(history[0], oldSnapshot); assert.notEqual(history[0].file, history[1].file);
  current = { ...current, terms: '60 days', updatedAt: 'v3', status: 'SAVED', revisionPending: true };
  input = { ...request(), sendId: '33333333-3333-4333-8333-333333333333' };
  failure = 'SMTP timeout'; await assert.rejects(sendQuotationVersion(input, deliver), /uncertain|confirm/i); assert.equal(history.at(-1).state, 'UNCERTAIN'); assert.equal(current.revision, 1);
  const count = deliveries; await assert.rejects(sendQuotationVersion(input, deliver), /uncertain|confirm|progress/i); assert.equal(deliveries, count);
  await assert.rejects(sendQuotationVersion({ ...input, quotationNo: ` ${input.quotationNo} ` }, deliver), /uncertain|confirm|progress/i); assert.equal(deliveries, count, 'Whitespace cannot bypass unresolved history');
  history = history.filter(e => e.state !== 'UNCERTAIN'); failure = ''; failComplete = true;
  await assert.rejects(sendQuotationVersion({ ...input, sendId: '44444444-4444-4444-8444-444444444444' }, deliver), /record|history|confirm|uncertain/i);
  assert.equal(history.at(-1).state, 'UNCERTAIN'); assert.equal(current.revision, 1);
  history = []; failComplete = false;
  await assert.rejects(sendQuotationVersion({ ...request(), sendId: '66666666-6666-4666-8666-666666666666' }, async () => ({ messageId: 'partial', accepted: ['test@example.test'] })), /uncertain|confirm/i);
  assert.equal(history.at(-1).state, 'UNCERTAIN', 'Partial CC acceptance must never allow automatic duplicate delivery');
  current = { ...current, terms: ' ' }; await assert.rejects(sendQuotationVersion({ ...request(), sendId: '55555555-5555-4555-8555-555555555555' }, deliver));
  console.log('Quotation validation/revision/send lifecycle tests passed (no real email or Google calls).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

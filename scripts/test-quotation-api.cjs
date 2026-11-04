/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');
async function main() {
  const terms = createLoader()('src/lib/quotationTerms.ts');
  const revision = createLoader()('src/lib/quotationRevision.ts');
  const q = { quotationNo: 'Q-20261104-002', customer: 'Saved customer', description: 'Saved repair', amount: 900, terms: 'Cash', delivery: 'On site', warranty: 'No warranty', status: 'SAVED', revision: 0, revisionPending: true, items: [], notation: [], file: '', date: 'Nov 4, 2026', discount: 0, preparedBy: 'Preparer', approvedBy: '', updatedAt: 'v1' };
  let calls = 0, sent, upload = 0, saved = 0, archived = 0;
  const mocks = {
    '@/lib/auth/session': { requireAuthenticatedSession: async () => ({ username: 'tester', fullName: 'Test sender' }) },
    '@/lib/userSheets': { getUserByUsername: async () => null },
    '@/lib/departmentSheets': { getDepartmentById: async () => null },
    '@/lib/positionSheets': { getPositionById: async () => null },
    '@/lib/quotationSending': { sendQuotationVersion: async (input, deliver) => { calls++; assert.equal(input.actor, 'tester'); const result = await deliver(q, 'Q-20261104-002 — Revision 1', { to: input.recipient, cc: input.cc }); assert.equal(result.messageId, 'msg'); return { revision: 1, fileLink: 'sent.pdf', sendId: input.sendId }; } },
    nodemailer: { createTransport: () => ({ sendMail: async options => { sent = options; return { messageId: 'msg', accepted: ['test@example.test'] }; } }) },
  };
  process.env.SMTP_USER = 'sender@example.test'; process.env.SMTP_PASSWORD = 'test-only-not-a-real-secret';
  const route = createLoader(mocks)('src/app/api/quotations/send-email/route.ts');
  function request(valid = true) { const form = new FormData(); form.set('quotationNo', q.quotationNo); form.set('sendId', '11111111-1111-4111-8111-111111111111'); form.set('email', 'test@example.test'); form.set('cc', JSON.stringify(['sales.aerichinnovationcorp@gmail.com'])); if (valid) form.set('snapshotToken', revision.quotationSnapshotToken(q)); form.set('customer', 'Untrusted customer'); form.set('quotationDescription', 'Untrusted description'); form.set('grandTotal', '1'); form.set('file', new Blob(['%PDF-1.4\nTest'], { type: 'application/pdf' }), 'quotation.pdf'); return new Request('http://localhost/api/quotations/send-email', { method: 'POST', body: form }); }
  assert.equal((await route.POST(request(false))).status, 400); assert.equal(calls, 0);
  const response = await route.POST(request()); assert.equal(response.status, 200); assert.equal((await response.json()).data.revision, 1);
  assert.deepEqual(sent.cc, ['sales.aerichinnovationcorp@gmail.com']);
  assert.equal(sent.to, 'test@example.test');
  assert.ok(sent.subject.includes('Revision 1')); assert.ok(sent.subject.includes('Saved repair')); assert.ok(!sent.subject.includes('Untrusted'));
  assert.ok(sent.html.includes('Saved customer')); assert.ok(sent.html.includes('900.00')); assert.ok(sent.attachments[0].filename.includes('Revision 1'));
  q.revision = 1; q.revisionPending = false;
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(sent.subject, 'Revised Quotation Q-20261104-002 — Revision 1 | Aerich Innovation Corp.');
  assert.ok(sent.html.includes('This revised quotation supersedes the version previously sent under the same quotation number.'));
  assert.ok(sent.html.includes('Terms of Payment, Delivery, and Warranty.'));
  assert.ok(sent.html.includes('Kindly review the revised quotation and let us know if you have any questions or require further clarification.'));
  assert.ok(!sent.html.includes('Thank you for your interest'));
  const unauth = createLoader({ ...mocks, '@/lib/auth/session': { requireAuthenticatedSession: async () => new Response('Denied', { status: 401 }) } })('src/app/api/quotations/send-email/route.ts');
  assert.equal((await unauth.POST(request())).status, 401);
  const pdfRoute = createLoader({
    ...mocks,
    '@/lib/quotationSheets': { getQuotationByRefNo: async () => structuredClone(q) },
    '@/lib/quotationHistory': { preserveLegacyQuotation: async () => { archived++; } },
    '@/lib/quotationLock': { withQuotationLock: async (_id, fn) => fn() },
    '@/lib/quotationPdfStorage': { createQuotationPdf: async (_q, bytes) => { upload++; assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))); return 'new.pdf'; } },
    '@/lib/googleSheets': { getDatabaseSpreadsheetId: async () => 'test', getSheetsClient: async () => ({ spreadsheets: { values: { get: async () => ({ data: { values: [[q.quotationNo]] } }), update: async ({ range, requestBody }) => { assert.equal(range, 'Quotations!L2'); assert.deepEqual(requestBody.values, [['new.pdf']]); saved++; } } } }) },
  })('src/app/api/quotations/save-pdf/route.ts');
  const pdfRequest = token => new Request('http://localhost/api/quotations/save-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quotationNo: q.quotationNo, pdfBase64: Buffer.from('%PDF-1.4\nTest').toString('base64'), snapshotToken: token }) });
  assert.equal((await pdfRoute.POST(pdfRequest('stale'))).status, 409); assert.equal(upload, 0); assert.equal(saved, 0);
  assert.equal((await pdfRoute.POST(pdfRequest(revision.quotationSnapshotToken(q)))).status, 200); assert.equal(upload, 1); assert.equal(archived, 1); assert.equal(saved, 1);
  q.terms = ' '; assert.equal((await pdfRoute.POST(pdfRequest(revision.quotationSnapshotToken(q)))).status, 400); assert.equal(upload, 1);
  const { POST: save } = createLoader({ ...mocks, '@/lib/quotationSheets': { saveQuotationData: async () => { throw Error('Should not write'); } } })('src/app/api/quotations/save/route.ts');
  const logError = console.error; console.error = () => {};
  try { assert.equal((await save(new Request('http://localhost/api/quotations/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terms: ' ', customer: { companyName: 'Test' }, quotationDescription: 'Repair' }) }))).status, 400); }
  finally { console.error = logError; }
  assert.equal(terms.quotationTermsError(q, true).startsWith('Payment'), true);
  console.log('Quotation API tests passed: authenticated routes, required terms, stale PDF protection, authoritative email content and revision labels.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

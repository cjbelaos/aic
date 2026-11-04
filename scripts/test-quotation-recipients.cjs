/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');

async function main() {
  const { quotationRecipients, QUOTATION_SALES_CC } = createLoader()('src/lib/quotationRecipients.ts');
  const primary = { companyId: 'A', isPrimary: true, email: ' PRIMARY@example.test ' };
  const other = { companyId: 'A', isPrimary: false, email: 'second@example.test' };
  let contacts = [primary, other, { ...other, email: 'SECOND@example.test' }, { ...other, email: 'primary@example.test' }, { ...other, email: '' }, { ...other, email: QUOTATION_SALES_CC }, { ...other, companyId: 'B', email: 'unrelated@example.test' }];
  const expected = { to: 'primary@example.test', cc: [QUOTATION_SALES_CC, 'second@example.test'] };
  assert.deepEqual(quotationRecipients('A', contacts), expected);
  assert.throws(() => quotationRecipients(undefined, contacts), /company/i);
  assert.throws(() => quotationRecipients('B', contacts), /primary/i);
  assert.throws(() => quotationRecipients('A', [primary, primary]), /exactly one/i);
  for (const email of ['', ' ', 'invalid', 'a@example.test,b@example.test', 'a@example.test\r\nBcc: victim@example.test']) {
    assert.throws(() => quotationRecipients('A', [{ ...primary, email }]), /primary.*email/i);
  }
  assert.throws(() => quotationRecipients('A', [primary, { ...other, email: 'bad' }]), /CC email/i);
  assert.deepEqual(quotationRecipients('A', [{ ...primary, email: QUOTATION_SALES_CC }]), { to: QUOTATION_SALES_CC, cc: [] });

  let authenticated = true;
  let quotation = { customerId: 'A', terms: 'Cash', delivery: '7 days', warranty: 'No warranty' };
  const { GET } = createLoader({
    '@/lib/auth/session': { requireAuthenticatedSession: async () => authenticated ? {} : new Response('', { status: 401 }) },
    '@/lib/quotationSheets': { getQuotationByRefNo: async () => quotation },
    '@/lib/companyContactSheets': { getCompanyContacts: async () => contacts },
  })('src/app/api/quotations/[refNo]/recipients/route.ts');
  const get = () => GET(new Request('http://localhost'), { params: Promise.resolve({ refNo: 'Q-1' }) });
  let response = await get(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), expected);
  contacts = [other]; response = await get(); assert.equal(response.status, 400); assert.match((await response.json()).message, /primary/i);
  contacts = [{ ...primary, email: '' }]; response = await get(); assert.equal(response.status, 400); assert.match((await response.json()).message, /email/i);
  quotation = { ...quotation, warranty: ' ' }; assert.equal((await get()).status, 400);
  quotation = null; assert.equal((await get()).status, 404);
  authenticated = false; assert.equal((await get()).status, 401);
  console.log('Quotation recipient tests passed: primary contact errors, company isolation, CC deduplication, injection rejection, authenticated review endpoint.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

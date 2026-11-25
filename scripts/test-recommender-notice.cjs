/* eslint-disable @typescript-eslint/no-require-imports */
// Recommender notice: who is emailed, and the confirm is never blocked by mail.
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');

const users = [
  { userId: 'u1', username: 'jtech', fullName: 'Juan Tech', email: 't@x.com', departmentId: 1, positionId: 5 },
  { userId: 'u2', username: 'amgr', fullName: 'Ana Manager', email: 'm@x.com', departmentId: 1, positionId: 6 },
  { userId: 'u5', username: 'nomail', fullName: 'No Mail', email: '', departmentId: 1, positionId: 5 },
];
const positions = [{ positionId: 5, positionTitle: 'Technician' }, { positionId: 6, positionTitle: 'After Sales Manager' }];
const order = { salesOrderId: 'so-1', salesOrderNo: 'AIC-SO-2026-0001', customerNameSnapshot: 'ACME', quotationNo: 'Q-1', recommendedByUserId: 'u1', recommendedByName: 'Juan Tech' };
const items = [
  { description: 'Pump', quantity: 1, unitSnapshot: 'pc', lineStatus: 'ACTIVE' },
  { description: 'Old line', quantity: 3, unitSnapshot: 'pc', lineStatus: 'CANCELLED' },
];

function notifier(send) {
  const sent = [];
  const load = createLoader({
    '@/lib/userSheets': { getUsers: async () => users },
    '@/lib/positionSheets': { getPositions: async () => positions },
    '@/lib/emailService': { sendEmail: async mail => { sent.push(mail); return send(mail); } },
  });
  return { api: load('src/lib/salesOrders/recommenderNotice.ts'), sent };
}

(async () => {
  const quiet = console.error; console.error = () => {};
  try {
    let n = notifier(async () => ({ success: true }));
    let result = await n.api.notifyRecommender(order, items, 'https://app.example');
    assert.deepEqual(result, { status: 'SENT' });
    assert.equal(n.sent.length, 1);
    assert.equal(n.sent[0].to, 't@x.com');
    assert.deepEqual(n.sent[0].cc, ['m@x.com', 'aerichinnovationcorp@gmail.com']);
    assert.ok(n.sent[0].html.includes('https://app.example/dashboard/sales-orders/so-1'));
    assert.ok(n.sent[0].html.includes('Pump'));
    assert.ok(!n.sent[0].html.includes('Old line'), 'cancelled lines are not listed');

    // No recommender: nothing sent, no warning.
    n = notifier(async () => ({ success: true }));
    result = await n.api.notifyRecommender({ ...order, recommendedByUserId: '' }, items, 'https://app.example');
    assert.deepEqual(result, { status: 'SKIPPED' });
    assert.equal(n.sent.length, 0);

    // Technician without an email address.
    n = notifier(async () => ({ success: true }));
    result = await n.api.notifyRecommender({ ...order, recommendedByUserId: 'u5', recommendedByName: 'No Mail' }, items, 'https://app.example');
    assert.equal(result.status, 'FAILED');
    assert.equal(result.warning, 'Technician was not notified: No Mail has no email address.');
    assert.equal(n.sent.length, 0);

    // SMTP not configured.
    n = notifier(async () => ({ success: false }));
    result = await n.api.notifyRecommender(order, items, 'https://app.example');
    assert.deepEqual(result, { status: 'FAILED', warning: 'Technician was not notified: email is not configured.' });

    // Mail transport throws: still resolves, never rejects.
    n = notifier(async () => { throw new Error('SMTP down'); });
    result = await n.api.notifyRecommender(order, items, 'https://app.example');
    assert.deepEqual(result, { status: 'FAILED', warning: 'Technician was not notified: the email could not be sent.' });
  } finally { console.error = quiet; }
  console.log('Recommender notice tests passed: recipients, skipped, missing email, unconfigured and failing mail never block.');
})().catch(error => { console.error(error); process.exit(1); });

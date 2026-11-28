/* eslint-disable @typescript-eslint/no-require-imports */
// Tracker PIC (column U): the order's Recommended By name; blank keeps the cell.
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');

const load = createLoader({ '@/lib/googleSheets': { getSheetsClient: async () => { throw new Error('no network in tests'); } } });
const { trackerPic, projectTrackerLine } = load('src/lib/salesOrders/trackerWriter.ts');

const order = {
  salesOrderId: 'so-1', salesOrderNo: 'AIC-SO-2026-0042', legacyTrackerNo: '', receivedDate: '2026-11-28',
  customerPONo: '', customerNameSnapshot: 'ACME', remarks: '', orderStatus: 'CONFIRMED',
  assignedToUserId: 'user-id-should-not-appear', recommendedByName: 'Juan Dela Cruz',
};
const item = {
  orderCategory: 'Parts', productCodeSnapshot: 'PA-1', productNameSnapshot: 'Pump', description: 'Pump',
  quantity: 2, unitPrice: 100, discountAmount: 0, taxAmount: 0, lineTotal: 200, fulfilledQty: 0, cancelledQty: 0,
};

assert.equal(trackerPic({ recommendedByName: 'Juan Dela Cruz' }, 'Jerico'), 'Juan Dela Cruz', 'order name wins over the cell');
assert.equal(trackerPic({ recommendedByName: '  ' }, 'Jerico'), 'Jerico', 'blank name keeps the recorded value');
assert.equal(trackerPic({ recommendedByName: '' }), '', 'new row with no name stays blank');
assert.equal(trackerPic({}, 'Admin'), 'Admin', 'missing field keeps the recorded value');

assert.deepEqual(projectTrackerLine(order, item).uToV, ['Juan Dela Cruz', 'Pending']);
assert.deepEqual(projectTrackerLine({ ...order, recommendedByName: '' }, item, {}, 'Jodillo').uToV, ['Jodillo', 'Pending']);

console.log('tracker PIC tests passed');

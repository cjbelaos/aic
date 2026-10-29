/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Sheets integration regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : require(id), mod, mod.exports);
  return mod.exports;
}

async function main() {
  const actor = { userId: 'admin', displayName: 'Admin' };
  const original = { fulfillmentId: 'f1', salesOrderItemId: 'line1', fulfillmentType: 'DELIVERY', sourceDocumentType: 'DELIVERY_RECEIPT', sourceDocumentId: '3960', sourceLineId: 'dr-line1', quantity: 6, effectiveDate: '2026-10-30', status: 'POSTED' };
  let receipt, fulfillments, calls, fail;
  const integration = load('src/lib/deliverySalesOrderIntegration.ts', {
    '@/lib/deliverySheets': { getDeliveryReceipts: async () => receipt ? [receipt] : [] },
    '@/lib/salesOrders/service': {
      getOrderDetail: async () => ({ order: { version: 3 }, fulfillments }),
      postFulfillments: async (actorArg, orderId, input) => {
        if (fail) throw fail;
        calls.push({ actor: actorArg, orderId, input });
        fulfillments.push(...input.entries.map((entry, index) => ({ ...entry, fulfillmentId: `r${index}`, fulfillmentType: entry.type, status: 'POSTED' })));
      },
    },
  });
  function reset() {
    receipt = { drNumber: 3960, salesOrderId: 'so1', status: 'deleted', items: [] };
    fulfillments = [original, { ...original, fulfillmentId: 'unrelated', sourceDocumentId: '3961' }];
    calls = [];
    fail = undefined;
  }
  reset();
  await integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].orderId, 'so1');
  assert.deepEqual(calls[0].actor, actor);
  assert.equal(calls[0].input.expectedVersion, 3);
  assert.equal(calls[0].input.entries.length, 1);
  assert.deepEqual(calls[0].input.entries[0], {
    salesOrderItemId: 'line1', type: 'REVERSAL', quantity: 6, effectiveDate: '2026-10-30',
    sourceDocumentType: 'DELIVERY_RECEIPT', sourceDocumentId: '3960', sourceLineId: 'dr-line1',
    evidenceDriveFileId: '', reversesFulfillmentId: 'f1',
  });
  await integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor);
  assert.equal(calls.length, 1, 'Retry must not reverse the same fulfillment twice');

  reset();
  fulfillments.push({ fulfillmentType: 'REVERSAL', reversesFulfillmentId: 'f1', quantity: 2, status: 'POSTED' });
  await integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor);
  assert.equal(calls[0].input.entries[0].quantity, 4, 'Only reverse the outstanding quantity');
  reset();
  fail = new Error('Sheets unavailable');
  await assert.rejects(integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor), error => error === fail);
  fail = undefined;
  await integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor);
  assert.equal(calls[0].input.entries[0].quantity, 6);
  for (const status of ['printed', 'draft']) {
    reset(); receipt.status = status;
    await integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor);
    assert.equal(calls.length, 0, 'Live receipts must retain fulfillment');
  }
  reset(); receipt.salesOrderId = undefined;
  await integration.reverseDeletedDeliveryReleaseFulfillment(3960, actor);
  assert.equal(calls.length, 0);

  // Exercise the real deletion function: it must mark the source deleted before
  // reversing, preserve its Sales Order link, and stop on reversal failure.
  let row = Array(19).fill('');
  row[0] = '3960'; row[10] = 'printed'; row[18] = 'so1';
  let itemsCleared = false, reverseCalls = 0;
  const permissions = load('src/lib/salesOrders/permissions.ts');
  const errors = load('src/lib/salesOrders/errors.ts');
  const storage = load('src/lib/deliverySheets.ts', {
    '@/lib/googleSheets': {
      getDatabaseSpreadsheetId: async () => 'test',
      getSheetsClient: async () => ({ spreadsheets: { values: {
        get: async ({ range }) => ({ data: { values: range.endsWith('A2:A') ? [['3960']] : [row] } }),
        update: async ({ range, requestBody }) => {
          assert.equal(range, 'DeliveryReceipts!K2');
          row[10] = requestBody.values[0][0];
        },
      } } }),
    },
    '@/lib/salesOrders/permissions': permissions,
    '@/lib/salesOrders/errors': errors,
    '@/lib/deliverySalesOrderIntegration': { reverseDeletedDeliveryReleaseFulfillment: async (number, who) => {
      assert.equal(number, 3960); assert.deepEqual(who, actor);
      assert.equal(row[10], 'deleted'); assert.equal(row[18], 'so1'); reverseCalls++;
      if (fail) throw fail;
    } },
    '@/lib/transactionItemSheets': { replaceDeliveryItems: async () => { itemsCleared = true; } },
    '@/lib/contractReleaseSheets': { getContractReleases: async () => [] },
  });
  const logError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(storage.deleteDeliveryReceipt(3960, actor, 2), error => error.status === 403);
    assert.equal(row[10], 'printed'); assert.equal(reverseCalls, 0);
    fail = new Error('Reversal failed');
    await assert.rejects(storage.deleteDeliveryReceipt(3960, actor, 1), error => error === fail);
    assert.equal(row[10], 'deleted'); assert.equal(itemsCleared, false);
    fail = undefined;
    await storage.deleteDeliveryReceipt(3960, actor, 1);
    assert.equal(itemsCleared, true); assert.equal(reverseCalls, 2);
  } finally { console.error = logError; }
  console.log('Delivery deletion and fulfillment reversal regression tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

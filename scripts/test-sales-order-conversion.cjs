/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createLoader } = require('./proforma-runtime.cjs');

async function main() {
  let saved;
  const quotation = {
    quotationNo: 'Q-TEST', customerId: 'C-1', customer: 'Customer',
    file: 'https://drive.google.com/file/d/test/view', amount: 520000, discount: 24180,
    items: [
      ...[48080, 60220, 77600, 61940, 4500].map((unitPrice, index) => ({
        productId: `P-${index}`, description: `Product ${index}`, quantity: 2, unit: 'SET', unitPrice,
      })),
      { description: 'Installation', quantity: 1, unit: '', unitPrice: 39500 },
    ],
  };
  const service = createLoader({
    '@/lib/quotationSheets': { getQuotationByRefNo: async () => quotation },
    '@/lib/productReferenceSheets': {
      getProductCategories: async () => [{ productCategoryId: 'SERVICE', categoryName: 'Services/ Repair', status: 'active' }],
      getProductUnits: async () => [{ unitId: 'U-SET', unitCode: 'SET', status: 'active' }],
    },
    './repository.ts': {
      readSalesOrders: async () => [],
      readSalesOrderCommandResult: async () => null,
      writeSalesOrderCommand: async ({ payload }) => {
        saved = payload;
        return { result: { salesOrderId: payload.salesOrderId } };
      },
      readSalesOrderDetailSnapshot: async () => ({ ...saved, history: [], documents: [], fulfillments: [], documentLinks: [] }),
    },
  })('src/lib/salesOrders/service.ts');
  for (const initialStatus of ['CONFIRMED', 'DRAFT']) {
    const detail = await service.createOrderFromQuotation({ userId: 'tester', displayName: 'Tester' }, {
      commandId: crypto.randomUUID(), quotationNo: quotation.quotationNo, initialStatus,
    });
    assert.equal(detail.order.orderStatus, initialStatus);
    assert.equal(detail.items.length, 6);
    assert.equal(detail.items[5].unitId, 'U-SET');
    assert.equal(detail.items[5].unitSnapshot, 'SET');
    assert.equal(detail.items[5].description, 'Installation');
    assert.equal(detail.order.grandTotal, 520000);
    assert.deepEqual(detail.items.map(item => item.unitPrice), quotation.items.map(item => item.unitPrice));
  }
  console.log('Sales Order conversion preserves all quoted items and resolves blank service units.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

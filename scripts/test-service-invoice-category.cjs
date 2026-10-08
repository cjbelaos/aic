/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads server modules with isolated Sheets mocks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

function load(file, mocks) {
  const fixtureModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : `${id}.ts`), mocks) : require(id), fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

(async () => {
  const tracking = load('src/lib/serviceInvoiceTracking.ts', {});
  const filters = load('src/lib/serviceInvoiceFilters.ts', { './serviceInvoiceTracking': tracking, './serviceInvoiceSummary': load('src/lib/serviceInvoiceSummary.ts', { './serviceInvoiceTracking': tracking }) });
  let row = Array(21).fill('');
  row[0] = '1001'; row[8] = 'paid';
  row[19] = JSON.stringify({ status: 'COMPLETED', fulfillmentIds: ['f1'], replacesInvoiceNo: '999', notes: 'Keep history' });
  let writes = [];
  let orderExists = false;
  const sheets = { spreadsheets: { values: {
    get: async ({ range }) => ({ data: { values: range.endsWith('A2:A') ? [['1001']] : [row] } }),
    batchUpdate: async (request) => { writes.push(request); const metadata = request.requestBody.data.find((entry) => entry.range.endsWith('T2')); row[19] = metadata.values[0][0]; },
  } } };
  const storage = load('src/lib/serviceInvoiceSheets.ts', {
    './serviceInvoiceTracking': tracking,
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'fixture' },
    '@/lib/serviceInvoiceFilters': filters,
    '@/lib/salesOrders/repository': { readSalesOrderById: async () => orderExists ? {salesOrderId:'so1'} : null },
    '@/lib/salesOrders/service': { getOrderDetail: async () => ({category:'Service'}) },
    '@/lib/deliverySheets': { resolveDeliveryReceiptReferences: async () => ({salesOrderId:'so1'}) },
  });
  await storage.updateServiceInvoiceCategory('1001', ['Parts', 'Consumables'], 'editor');
  let saved = JSON.parse(row[19]);
  assert.deepEqual(saved.manualCategories, ['Parts', 'Consumables']);
  assert.deepEqual(saved.fulfillmentIds, ['f1']); assert.equal(saved.status, 'COMPLETED'); assert.equal(saved.replacesInvoiceNo, '999'); assert.equal(saved.notes, 'Keep history');
  assert.deepEqual(writes[0].requestBody.data.map((entry) => entry.range), ['ServiceInvoices!T2', 'ServiceInvoices!G2:H2']);
  await storage.updateServiceInvoiceCategory('1001', [], 'editor');
  assert.deepEqual(JSON.parse(row[19]).manualCategories, []);
  row[20] = 'TR_NUMBER';
  await assert.rejects(storage.updateServiceInvoiceCategory('1001', [], 'editor'), /select a category before saving/);
  row[20] = '';
  row[8] = 'created'; await storage.updateServiceInvoiceCategory('1001', ['Service'], 'editor');
  row[8] = 'cancelled'; await assert.rejects(storage.updateServiceInvoiceCategory('1001', ['Project'], 'editor'), /no longer be edited/);
  row[8] = 'paid'; row[18] = 'so1'; orderExists = true;
  await assert.rejects(storage.updateServiceInvoiceCategory('1001', ['Project'], 'editor'), /automatically assigned/);
  row[18] = ''; row[11] = 42; await assert.rejects(storage.updateServiceInvoiceCategory('1001', ['Project'], 'editor'), /automatically assigned/);
  row[11] = ''; row[10] = 'contract1'; await assert.rejects(storage.updateServiceInvoiceCategory('1001', ['Project'], 'editor'), /automatically assigned/);
  await assert.rejects(storage.updateServiceInvoiceCategory('1001', ['Invalid'], 'editor'), /Invalid invoice category/);
  let session = new Response(null, {status:401});
  let called = false;
  const route = load('src/app/api/service-invoices/[invoiceNo]/route.ts', {
    '@/lib/auth/session': {requireAuthenticatedSession: async () => session},
    '@/lib/serviceInvoiceSheets': { updateServiceInvoiceCategory: async (invoiceNo, values, actor) => {filters.validateManualCategories(values); assert.equal(invoiceNo,'1001'); assert.equal(actor,'editor'); called = true;} },
  });
  const context = {params:Promise.resolve({invoiceNo:'1001'})};
  assert.equal((await route.PATCH(new Request('http://test', {method:'PATCH',body:'{}'}),context)).status,401);
  assert.equal(called,false);
  session = {userId:'editor'};
  assert.equal((await route.PATCH(new Request('http://test', {method:'PATCH',body:JSON.stringify({manualCategories:['Parts']})}),context)).status,200);
  assert.equal(called,true);
  assert.equal((await route.PATCH(new Request('http://test', {method:'PATCH',body:JSON.stringify({manualCategories:['Invalid']})}),context)).status,400);
  console.log('PASS manual category persistence, history preservation, status eligibility, automatic priority, validation and authenticated route');
})().catch((error) => { console.error(error); process.exitCode = 1; });

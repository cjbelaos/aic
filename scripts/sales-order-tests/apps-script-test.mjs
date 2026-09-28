// Execute the deployed source unchanged. Only Google service boundaries are mocked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
import { createRequire } from 'node:module';

const books = new Map();
const properties = { SOURCE_SPREADSHEET_ID: 'source', DESTINATION_SPREADSHEET_ID: 'destination', DESTINATION_SHEET_ID: '99', GATEWAY_SHARED_SECRET: 'test-secret', SYNC_ENV: 'staging', ENABLE_LEGACY_OUTBOUND_SYNC: '1' };
let failCommit = false, batches = 0, locked = false;
function rawSheet(sheet) {
  return { getSheetId: () => sheet.id, getMaxRows: () => sheet.maxRows, getMaxColumns: () => sheet.width,
    getDataRange: () => ({ getValues: () => structuredClone(sheet.rows) }) };
}
const context = vm.createContext({
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' }, getUuid: randomUUID,
    computeDigest(algorithm, text, charset) { assert.equal(typeof text, 'string'); assert.equal(charset, 'utf8'); return [...createHash(algorithm).update(text).digest()].map(n => n > 127 ? n - 256 : n); },
    computeHmacSha256Signature(text, secret, charset) { assert.equal(typeof text, 'string'); assert.equal(charset, 'utf8'); return [...createHmac('sha256', secret).update(text).digest()]; },
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  },
  LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { locked = false; } }) },
  SpreadsheetApp: { openById: id => {
    const book = books.get(id); assert.ok(book, `Unknown book ${id}`);
    return { getSheetByName: name => book[name] ? rawSheet(book[name]) : null,
      getSheetById: id => { const sheet = Object.values(book).find(s => s.id === id); return sheet ? rawSheet(sheet) : null; } };
  } },
  Sheets: { Spreadsheets: { batchUpdate({ requests }, id) {
    assert.ok(locked, 'all runtime writes hold the shared lock');
    if (failCommit) throw new Error('Injected atomic batch failure');
    const copy = structuredClone(books.get(id));
    for (const req of requests) {
      if (req.appendDimension) { Object.values(copy).find(s => s.id === req.appendDimension.sheetId).maxRows += req.appendDimension.length; continue; }
      const { range, rows, fields } = req.updateCells;
      assert.equal(fields, 'userEnteredValue');
      const sheet = Object.values(copy).find(s => s.id === range.sheetId);
      rows.forEach((row, i) => {
        const target = range.startRowIndex + i;
        while (sheet.rows.length <= target) sheet.rows.push(Array(sheet.width).fill(''));
        row.values.forEach((cell, j) => {
          const v = cell.userEnteredValue;
          assert.ok(!v || !('formulaValue' in v), 'user text never interpreted as formula');
          sheet.rows[target][range.startColumnIndex + j] = v ? (v.stringValue ?? v.numberValue ?? v.boolValue) : '';
        });
      });
    }
    books.set(id, copy); batches++;
  } } },
});
vm.runInContext(readFileSync('apps-script/sales-order-writer/Code.gs', 'utf8'), context, { filename: 'Code.gs' });
const source = {};
let sheetId = 1;
for (const [key, tab] of Object.entries(context.TABS)) source[tab] = { id: sheetId++, width: context.WIDTHS[key], maxRows: 100, rows: [Array(context.WIDTHS[key]).fill('header')] };
books.set('source', source);
const headers = Array.from({ length: 23 }, (_, i) => `Legacy${i}`).concat(Array.from(context.APP_HEADERS));
books.set('destination', { tracker: { id: 99, width: 31, maxRows: 100, rows: [headers] } });
function command(type, payload, id = randomUUID(), expectedVersion = null) {
  const envelope = { version: 1, commandId: id, commandType: type, salesOrderId: payload.salesOrderId ?? null,
    expectedVersion, actorUserId: 'admin', issuedAt: new Date().toISOString(), payloadHash: context.payloadHash_(payload) };
  envelope.signature = context.hmacBase64Url_(properties.GATEWAY_SHARED_SECRET, context.canonicalJson_(envelope));
  return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ envelope, payload }) } }).text);
}
const order = { salesOrderId: 'order-1', salesOrderNo: '', receivedDate: '2026-09-20', customerId: 'c1', customerPONo: '000012',
  orderStatus: 'DRAFT', fulfillmentStatus: 'UNFULFILLED', version: 1, remarks: '=literal', importQuality: '' };
const item = { salesOrderItemId: 'line-1', salesOrderId: order.salesOrderId, lineNo: 1, orderCategory: 'Parts', lineType: 'PRODUCT',
  quantity: 2, unitPrice: 100, discountAmount: 0, taxAmount: 21.43, lineTotal: 200, fulfilledQty: 0, cancelledQty: 0, lineStatus: 'ACTIVE' };
const payload = { salesOrderId: order.salesOrderId, order, items: [item], history: [], requestHash: 'stable-create-intent' };
const id = randomUUID();
failCommit = true;
assert.equal(command('so.create', payload, id).ok, false);
assert.equal(books.get('source').SalesOrders.rows.length, 1, 'failed batch leaves no header');
assert.equal(books.get('source').SalesOrderCommands.rows.length, 1, 'failed batch leaves no receipt');
failCommit = false;
assert.equal(command('so.create', payload, id).ok, true);
assert.equal(batches, 1, 'header/items/receipt commit in one batch');
assert.equal(books.get('source').SalesOrders.rows[1][12], '000012');
assert.equal(books.get('source').SalesOrders.rows[1][25], '=literal');
assert.equal(command('so.create', { ...payload, order: { ...order, salesOrderId: 'regenerated' } }, id).replayed, true);
assert.equal(command('so.create', { ...payload, requestHash: 'different' }, id).status, 409);
assert.equal(command('so.receipt', { requestHash: 'stable-create-intent' }, id).replayed, true);
assert.equal(command('so.receipt', { requestHash: 'new' }).result, null);
const confirm = command('so.confirm', { ...payload, requestHash: 'confirm', order: { ...order, orderStatus: 'CONFIRMED' } }, randomUUID(), 1);
assert.equal(confirm.result.salesOrderNo, 'AIC-SO-2026-0001');
assert.equal(context.trackerDisplayNumber_('', confirm.result.salesOrderNo), '0001', 'new orders publish their padded numeric suffix');
assert.equal(context.trackerDisplayNumber_('1297', confirm.result.salesOrderNo), '1297', 'migrated rows preserve their legacy tracker number');
assert.equal(context.trackerDisplayNumber_('', 'AIC-SO-2026-10000'), '10000', 'tracker numbers continue past four digits without truncation');
assert.equal(command('so.confirm', { ...payload, requestHash: 'stale' }, randomUUID(), 1).status, 409);
const confirmed = { ...order, orderStatus: 'CONFIRMED', salesOrderNo: confirm.result.salesOrderNo, version: 2 };
assert.equal(command('so.update', { ...payload, order: confirmed, hadItems: true, requestHash: 'edit' }, randomUUID(), 2).ok, true);
assert.equal(context.processDueJobs_().processed, 0, 'Apps Script no longer publishes Tracker rows.');
console.log('apps-script-test passed: actual Code.gs protocol, atomic failure, replay, and numbering.');

// Load actual TypeScript service/client/repository code. Only Sheets reads and
// HTTP delivery are replaced, so generated IDs and state-validation ordering
// participate in these retry tests rather than being simulated by a server.
const nativeRequire = createRequire(import.meta.url), modules = new Map();
process.env.SALES_ORDER_GATEWAY_URL = 'https://test.invalid/gateway';
process.env.SALES_ORDER_GATEWAY_SECRET = properties.GATEWAY_SHARED_SECRET;
let loseResponse = false;
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const loadedModule = { exports: {} }; modules.set(file, loadedModule);
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const require = name => {
    if (name === '@/lib/googleSheets') return {
      getDatabaseSpreadsheetId: () => 'source', getSheetsClient: async () => ({ spreadsheets: { values: { get: async ({ range }) => {
        const tab = range.split('!')[0]; return { data: { values: structuredClone(books.get('source')[tab].rows.slice(1)) } };
      } } } }),
    };
    if (name === '@/lib/quotationSheets') return { getQuotationByRefNo: async () => null };
    if (name.startsWith('node:')) return nativeRequire(name);
    if (name.startsWith('.') || name.startsWith('@/')) {
      let target = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
      if (!target.endsWith('.ts')) target += '.ts';
      return load(target);
    }
    return nativeRequire(name);
  };
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`, {
    console, process, Buffer, crypto: globalThis.crypto, AbortSignal, setTimeout, clearTimeout,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      const text = context.doPost({ postData: { contents: options.body } }).text;
      if (loseResponse && body.envelope.commandType !== 'so.receipt') { loseResponse = false; throw new Error('Response lost after commit'); }
      return { status: 200, text: async () => text };
    },
  }, { filename: file })(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const service = load('src/lib/salesOrders/service.ts');
const validation = load('src/lib/salesOrders/validation.ts');
const actor = { userId: 'admin', displayName: 'Admin' };
const input = validation.parseCreateOrderInput({ commandId: randomUUID(), customerId: 'c1', customerPONo: '0005', receivedDate: '2026-09-20',
  lines: [{ lineType: 'PRODUCT', productId: 'p1', description: 'Part', unitId: 'pc', quantity: 2, unitPrice: 100 }] });
loseResponse = true;
const created = await service.createOrder(actor, input);
const replayed = await service.createOrder(actor, input);
assert.equal(replayed.order.salesOrderId, created.order.salesOrderId, 'service retry reuses persisted UUID');
assert.equal(replayed.items[0].salesOrderItemId, created.items[0].salesOrderItemId);
assert.equal(created.order.orderStatus, 'CONFIRMED');
assert.match(created.order.salesOrderNo, /^AIC-SO-2026-\d{4,}$/);
await assert.rejects(service.createOrder(actor, { ...input, customerPONo: 'DIFFERENT' }), /different content/);
const edit = { commandId: randomUUID(), expectedVersion: 1, lines: [{ ...input.lines[0], salesOrderItemId: created.items[0].salesOrderItemId, quantity: 3 }] };
const updated = await service.updateOrder(actor, created.order.salesOrderId, edit);
assert.equal(updated.items[0].salesOrderItemId, created.items[0].salesOrderItemId, 'edit preserves stable line identity');
assert.equal((await service.updateOrder(actor, created.order.salesOrderId, edit)).order.version, updated.order.version);
const parallelOrders = await Promise.all([1, 2].map(() => service.createOrder(actor, { ...input, commandId: randomUUID() })));
assert.notEqual(parallelOrders[0].order.salesOrderNo, parallelOrders[1].order.salesOrderNo);
console.log('service-to-apps-script tests passed: actual service/repository/protocol, lost responses, repeated confirmed creation, edits, changed intent rejection, stable line IDs.');

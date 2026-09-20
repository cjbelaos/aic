// Execute the deployed source unchanged. Only Google service boundaries are mocked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
import { createRequire } from 'node:module';

const books = new Map();
const properties = { SOURCE_SPREADSHEET_ID: 'source', DESTINATION_SPREADSHEET_ID: 'destination', DESTINATION_SHEET_ID: '99', GATEWAY_SHARED_SECRET: 'test-secret', SYNC_ENV: 'staging' };
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
assert.equal(books.get('source').SalesOrderSyncJobs.rows.length, 2);
assert.equal(command('so.confirm', { ...payload, requestHash: 'stale' }, randomUUID(), 1).status, 409);
const confirmed = { ...order, orderStatus: 'CONFIRMED', salesOrderNo: confirm.result.salesOrderNo, version: 2 };
assert.equal(command('so.update', { ...payload, order: confirmed, hadItems: true, requestHash: 'edit' }, randomUUID(), 2).ok, true);
assert.equal(books.get('source').SalesOrderSyncJobs.rows.length, 3, 'confirmed edit enqueues job even with worker disabled');
let result = context.processDueJobs_();
assert.equal(result.processed, 2);
let dest = books.get('destination').tracker;
assert.equal(dest.rows[1][16], '', 'Q untouched');
assert.equal(dest.rows[1][23], 'order-1');
assert.equal(dest.rows[1][24], 'line-1');
assert.equal(dest.rows[1][12], 21.43, 'VAT snapshot published');
dest.rows[1][16] = '=INVENTORY()'; dest.rows[1][19] = '=DELIVERY()'; dest.rows[1][22] = '=AGE()';
const edited = { ...confirmed, version: 3 };
command('so.update', { ...payload, order: edited, items: [{ ...item, lineStatus: 'INACTIVE' }], hadItems: true, requestHash: 'inactive' }, randomUUID(), 3);
context.processDueJobs_();
dest = books.get('destination').tracker;
assert.equal(dest.rows[1][16], '=INVENTORY()'); assert.equal(dest.rows[1][19], '=DELIVERY()'); assert.equal(dest.rows[1][22], '=AGE()');
assert.equal(dest.rows[1][27], 'INACTIVE', 'inactive row retained with status');
dest.rows[1][5] = 'manual edit';
command('so.update', { ...payload, order: { ...edited, version: 4 }, hadItems: true, requestHash: 'conflict' }, randomUUID(), 4);
result = context.processDueJobs_();
assert.ok(result.blocked.length > 0, 'manual edit blocks publication');
assert.equal(books.get('destination').tracker.rows[1][5], 'manual edit');
console.log('apps-script-test passed: actual Code.gs protocol, atomic failure, replay, numbering, outbox, publication, formulas, inactive lines, conflicts.');

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
const created = await service.createDraft(actor, input);
const replayed = await service.createDraft(actor, input);
assert.equal(replayed.order.salesOrderId, created.order.salesOrderId, 'service retry reuses persisted UUID');
assert.equal(replayed.items[0].salesOrderItemId, created.items[0].salesOrderItemId);
await assert.rejects(service.createDraft(actor, { ...input, customerPONo: 'DIFFERENT' }), /different content/);
const confirmation = { commandId: randomUUID(), expectedVersion: 1 };
loseResponse = true;
const confirmedService = await service.confirmOrder(actor, created.order.salesOrderId, confirmation);
const confirmationReplay = await service.confirmOrder(actor, created.order.salesOrderId, confirmation);
assert.equal(confirmationReplay.order.salesOrderNo, confirmedService.order.salesOrderNo, 'confirmed-state retry replays before DRAFT validation');
const edit = { commandId: randomUUID(), expectedVersion: 2, lines: [{ ...input.lines[0], salesOrderItemId: created.items[0].salesOrderItemId, quantity: 3 }] };
const updated = await service.updateOrder(actor, created.order.salesOrderId, edit);
assert.equal(updated.items[0].salesOrderItemId, created.items[0].salesOrderItemId, 'edit preserves stable line identity');
assert.equal((await service.updateOrder(actor, created.order.salesOrderId, edit)).order.version, updated.order.version);
const parallelDrafts = await Promise.all([1, 2].map(() => service.createDraft(actor, { ...input, commandId: randomUUID() })));
const parallelConfirm = await Promise.all(parallelDrafts.map(d => service.confirmOrder(actor, d.order.salesOrderId, { commandId: randomUUID(), expectedVersion: 1 })));
assert.notEqual(parallelConfirm[0].order.salesOrderNo, parallelConfirm[1].order.salesOrderNo);

// Real claim: durable destination commit, lost acknowledgment, expired lease,
// new worker retry and old worker rejection. The row must not be appended twice.
const pendingJob = books.get('source').SalesOrderSyncJobs.rows.find(r => r[1] === parallelDrafts[0].order.salesOrderId);
const claimInput = { job: { syncJobId: pendingJob[0] }, destination: { spreadsheetId: 'destination', sheetId: '99' }, leaseToken: randomUUID(), leaseOwner: 'first' };
const claimed = command('so.sync.claim', claimInput);
assert.equal(claimed.result.published, true);
const count = books.get('destination').tracker.rows.length;
books.get('source').SalesOrderSyncJobs.rows.find(r => r[0] === pendingJob[0])[12] = '2000-01-01T00:00:00.000Z';
const newClaim = command('so.sync.claim', { ...claimInput, leaseToken: randomUUID(), leaseOwner: 'second' });
assert.equal(newClaim.result.published, true);
assert.equal(books.get('destination').tracker.rows.length, count, 'lost acknowledgment does not duplicate destination');
assert.equal(command('so.sync.complete', { job: claimInput.job, leaseToken: claimInput.leaseToken }).ok, false);
assert.equal(command('so.sync.complete', { job: claimInput.job, leaseToken: newClaim.result.leaseToken }).result.synced, true);
console.log('service-to-apps-script tests passed: actual service/repository/protocol, lost responses, repeated create/confirm/edit, changed intent rejection, stable line IDs.');

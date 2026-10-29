/* eslint-disable @typescript-eslint/no-require-imports -- Runs the application reversal logic with local credentials. */
// Dry-run by default. Usage:
// node --env-file=.env.local scripts/repair-deleted-delivery-fulfillment.cjs --dr-number 3960 --sales-order-no AIC-SO-2026-1408 [--apply]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();

// Resolve the application's TypeScript aliases without a build or a new dependency.
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = (id) => {
    if (!id.startsWith('@/') && !id.startsWith('.')) return require(id);
    const base = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(file), id);
    const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Cannot resolve ${id} from ${file}`);
    return /\.tsx?$/.test(resolved) ? load(resolved) : require(resolved);
  };
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}

async function main() {
  const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
  assert.ok(process.argv.includes('--dr-number') && process.argv.includes('--sales-order-no'), 'Pass --dr-number and --sales-order-no.');
  const drNumber = Number(argument('--dr-number'));
  assert.ok(Number.isSafeInteger(drNumber) && drNumber > 0, 'Invalid DR number.');
  const { getDeliveryReceipts } = load(path.join(root, 'src/lib/deliverySheets.ts'));
  const { getOrderDetail } = load(path.join(root, 'src/lib/salesOrders/service.ts'));
  const { reverseDeletedDeliveryReleaseFulfillment } = load(path.join(root, 'src/lib/deliverySalesOrderIntegration.ts'));
  const receipt = (await getDeliveryReceipts()).find(entry => entry.drNumber === drNumber);
  assert.ok(receipt?.salesOrderId && receipt.status.toLowerCase() === 'deleted', 'Only a deleted receipt linked to a Sales Order can be repaired.');
  const before = await getOrderDetail(receipt.salesOrderId);
  assert.equal(before.order.salesOrderNo, argument('--sales-order-no'), 'Sales Order does not match the requested repair.');
  const sources = before.fulfillments.filter(entry => entry.status === 'POSTED' && entry.fulfillmentType === 'DELIVERY' && entry.sourceDocumentType === 'DELIVERY_RECEIPT' && entry.sourceDocumentId === String(drNumber));
  const outstanding = (detail, source) => Number((source.quantity - detail.fulfillments.filter(entry => entry.status === 'POSTED' && entry.fulfillmentType === 'REVERSAL' && entry.reversesFulfillmentId === source.fulfillmentId).reduce((sum, entry) => sum + entry.quantity, 0)).toFixed(2));
  const report = (detail) => ({ drNumber, salesOrderNo: detail.order.salesOrderNo, fulfillmentStatus: detail.order.fulfillmentStatus,
    lines: detail.items.map(item => ({ lineNo: item.lineNo, quantity: item.quantity, fulfilledQty: item.fulfilledQty, cancelledQty: item.cancelledQty })),
    outstandingReversalQty: sources.reduce((sum, source) => sum + outstanding(detail, source), 0) });
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', before: report(before) }, null, 2));
  if (!process.argv.includes('--apply')) return;
  await reverseDeletedDeliveryReleaseFulfillment(drNumber, { userId: 'system:deleted-delivery-repair', displayName: 'Deleted delivery fulfillment repair' });
  const after = await getOrderDetail(receipt.salesOrderId);
  for (const source of sources) assert.equal(outstanding(after, source), 0, 'Reversal verification failed.');
  console.log(JSON.stringify({ after: report(after), verified: true }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

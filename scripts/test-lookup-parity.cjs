/* eslint-disable @typescript-eslint/no-require-imports -- Parity harness: Sheets path vs PostgreSQL path. */
// Runs each migrated read twice: on the Sheets path fed by the captured snapshot (as the Sheets API
// returned it) and on the PostgreSQL path against the database imported from that same snapshot.
// The results must match record for record.
//   node --env-file=.env.local scripts/test-lookup-parity.cjs [snapshotDir]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const url = process.env.TEST_DATABASE_URL || process.env.STAGING_APP_DATABASE_URL;
const snapDir = process.argv[2] || 'tmp/migration/snapshot-staging-1';
if (!url || !fs.existsSync(`${snapDir}/database.json`)) { console.log('SKIP lookup parity: needs STAGING_APP_DATABASE_URL and a snapshot'); process.exit(0); }
process.env.DATABASE_URL = url;
const snapshot = JSON.parse(fs.readFileSync(`${snapDir}/database.json`, 'utf8')).tabs;

// A1 range "Tab!A2:K" -> snapshot formatted rows, like values.get returns them (trailing blanks trimmed).
const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function valuesFor(range) {
  const m = /^'?(.+?)'?!([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/.exec(range);
  if (!m) throw new Error(`unsupported range ${range}`);
  const rows = snapshot[m[1]]?.formatted ?? [];
  const from = colIndex(m[2]); const to = m[4] ? colIndex(m[4]) : from;
  const out = rows.slice(Number(m[3]) - 1).map((r) => r.slice(from, to + 1).map((v) => String(v ?? '')));
  return out.map((r) => { while (r.length && r.at(-1) === '') r.pop(); return r; });
}
const fakeSheets = { spreadsheets: {
  get: async () => ({ data: { sheets: Object.entries(snapshot).map(([title, t]) => ({ properties: { title, gridProperties: { columnCount: Math.max(26, (t.formatted[0] || []).length), rowCount: t.formatted.length } } })) } }),
  values: {
    get: async ({ range }) => ({ data: { values: valuesFor(range) } }),
    batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map((range) => ({ range, values: valuesFor(range) })) } }),
  },
} };
const mocks = {
  '@/lib/googleSheets': { getSheetsClient: async () => fakeSheets, getDatabaseSpreadsheetId: async () => 'snapshot' },
  'next/headers': { cookies: async () => ({ get: () => undefined }) },
};
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const mod = { exports: {} }; cache.set(full, mod);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolveTs = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  const req = (id) => Object.hasOwn(mocks, id) ? mocks[id]
    : id.startsWith('@/') ? load(resolveTs(path.join('src', id.slice(2))))
    : id.startsWith('.') ? load(resolveTs(path.join(path.dirname(full), id))) : require(id);
  new Function('require', 'module', 'exports', output)(req, mod, mod.exports);
  return mod.exports;
}

// Sheets kept seconds-only ISO stamps on some rows; PostgreSQL always prints milliseconds.
// Coordinates: the Sheets API returned display-rounded values; PostgreSQL keeps the full stored value.
// JSON stored as text: PostgreSQL jsonb reorders keys and adds spaces; compare the parsed content.
const canonical = (v) => (Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
const jsonText = (s) => { if (!/^[[{]/.test(s)) return undefined; try { return JSON.stringify(canonical(JSON.parse(s))); } catch { return undefined; } };
const normalize = (value) => JSON.parse(JSON.stringify(value, (k, v) => {
  if (typeof v === 'string' && jsonText(v) !== undefined) return jsonText(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return v.replace('Z', '.000Z');
  if ((k === 'latitude' || k === 'longitude') && typeof v === 'number') return Math.round(v * 1e6) / 1e6;
  return v;
}));

async function compare(label, run, { key, ignore = [] } = {}) {
  delete process.env.DATA_BACKEND;
  const sheet = normalize(await run());
  process.env.DATA_BACKEND = 'postgres';
  const db = normalize(await run());
  delete process.env.DATA_BACKEND;
  const strip = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !ignore.includes(k))));
  const a = canonical(strip(sheet)); const b = canonical(strip(db)); // object key order is not significant
  if (key) { a.sort((x, y) => String(x[key]).localeCompare(String(y[key]))); b.sort((x, y) => String(x[key]).localeCompare(String(y[key]))); }
  const firstDiff = a.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(b[i]));
  if (a.length !== b.length || firstDiff >= 0) {
    const i = firstDiff >= 0 ? firstDiff : Math.min(a.length, b.length);
    const fields = a[i] && b[i] ? Object.keys({ ...a[i], ...b[i] }).filter((k) => JSON.stringify(a[i][k]) !== JSON.stringify(b[i][k])) : [];
    assert.fail(`${label}: sheet ${a.length} vs db ${b.length} records; first difference at ${i} (${key ? `${key}=${(a[i] ?? b[i])[key]}` : ''}) in fields ${fields.join(', ')}`);
  }
  console.log(`ok   ${label}: ${a.length} records identical`);
}

async function main() {
  try {
    await compare('companies', () => load('src/lib/companySheets.ts').getCompanies(), { key: 'companyId', ignore: ['id', 'row'] });
    await compare('customers', () => load('src/lib/companySheets.ts').getCustomers(), { key: 'companyId', ignore: ['id', 'row'] });
    await compare('products', () => load('src/lib/productSheets.ts').getProducts(), { key: 'productId' });
    await compare('supplier products', () => load('src/lib/supplierProductSheets.ts').getSupplierProducts(), { key: 'supplierProductId' });
    await compare('active supplier products', () => load('src/lib/supplierProductSheets.ts').getSupplierProducts({ status: 'active' }), { key: 'supplierProductId' });
    await compare('product categories', () => load('src/lib/productReferenceSheets.ts').getProductCategories(), { key: 'productCategoryId' });
    await compare('product units', () => load('src/lib/productReferenceSheets.ts').getProductUnits(), { key: 'unitId' });
    await compare('users', () => load('src/lib/userSheets.ts').getUsers(), { key: 'userId' });
    await compare('delivered-by options', () => load('src/lib/deliverySheets.ts').getDriversFromSheets(), {});
    await compare('delivery receipts (with items)', () => load('src/lib/deliverySheets.ts').getDeliveryReceipts(), { key: 'drNumber' });
    const so = () => load('src/lib/salesOrders/repository.ts');
    await compare('sales order list snapshot (orders)', async () => (await so().readSalesOrderListSnapshot()).orders, { key: 'salesOrderId' });
    await compare('sales order list snapshot (items)', async () => (await so().readSalesOrderListSnapshot()).items, { key: 'salesOrderItemId' });
    await compare('sales orders', () => so().readSalesOrders(), { key: 'salesOrderId' });
    const [{ salesOrderId: sampleOrder }] = await so().readSalesOrders();
    await compare('sales order detail (history)', async () => (await so().readSalesOrderDetailSnapshot(sampleOrder)).history, { key: 'eventId' });
    await compare('sales order detail (documents)', async () => (await so().readSalesOrderDetailSnapshot(sampleOrder)).documents, { key: 'documentId' });
    await compare('service invoices (with items)', () => load('src/lib/serviceInvoiceSheets.ts').getServiceInvoices(), { key: 'invoiceNo' });
    await compare('sales invoices (with items)', () => load('src/lib/salesInvoiceSheets.ts').getServiceInvoices(), { key: 'invoiceNo' });
    await compare('DR to sales order links', async () => [...(await load('src/lib/deliverySheets.ts').getDeliverySalesOrderLinks())].map(([dr, so]) => ({ dr, so })), { key: 'dr' });
    await compare('quotations (with details and notations)', () => load('src/lib/quotationSheets.ts').getQuotations(), { key: 'quotationNo' });
    console.log('Lookup parity tests passed.');
  } finally {
    if (globalThis.__aicPgPool) await globalThis.__aicPgPool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

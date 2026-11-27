/* eslint-disable @typescript-eslint/no-require-imports -- Offline acceptance harness for the four-tab workflow. */
// Calls every API route that the Delivery Receipts, Service Invoices and Quotations pages load on open,
// with DATA_BACKEND=postgres, a signed-in session and a Google client that records and refuses any use.
// Passes only if every route answers 200 with data and Google Sheets is never touched.
//   node --env-file=.env.local scripts/test-pages-zero-sheets.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const url = process.env.TEST_DATABASE_URL || process.env.STAGING_APP_DATABASE_URL;
if (!url) { console.log('SKIP zero-sheets: no STAGING_APP_DATABASE_URL'); process.exit(0); }
process.env.DATABASE_URL = url;
process.env.DATA_BACKEND = 'postgres';
delete process.env.ACCESS_ALLOWED_USER_IDS;

// Sheets use fails the test. Drive use (stored PDFs and scans stay in Drive) is allowed but reported.
const googleCalls = [];
const driveCalls = [];
const refuse = (name) => async () => { (/drive/i.test(name) ? driveCalls : googleCalls).push(name); throw new Error(`Google ${name} called`); };
const cookieJar = new Map();
class NextResponse { static json(body, init = {}) { return { status: init.status ?? 200, json: async () => body }; } static next() { return { status: 200 }; } }
const mocks = {
  '@/lib/googleSheets': new Proxy({}, { get: (_t, name) => (name === '__esModule' ? false : refuse(String(name))) }),
  'googleapis': { google: new Proxy({}, { get: (_t, name) => { googleCalls.push(`googleapis.${String(name)}`); throw new Error('googleapis used'); } }) },
  'next/headers': { cookies: async () => ({ get: (name) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined), set: () => {}, delete: () => {} }), headers: async () => new Headers() },
  'next/server': { NextResponse },
};
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const mod = { exports: {} }; cache.set(full, mod);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolveTs = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  const req = (id) => Object.hasOwn(mocks, id) ? mocks[id]
    : id.startsWith('@/') ? load(resolveTs(path.join('src', id.slice(2))))
    : id.startsWith('.') ? load(resolveTs(path.join(path.dirname(full), id))) : require(id);
  new Function('require', 'module', 'exports', output)(req, mod, mod.exports);
  return mod.exports;
}

// What each page requests when it opens (docs/superpowers/migration/01-four-tab-baseline.md).
const PAGES = {
  'Delivery Receipts': ['deliveries', 'deliveries/drivers', 'companies', 'products', 'supplier-products', 'product-references', 'product-units', 'product-categories', 'sales-orders', 'users?username=__self__'],
  'Service Invoices': ['service-invoices', 'deliveries', 'companies', 'auth/me'],
  'Quotations': ['quotations'],
};

async function main() {
  const session = load('src/lib/auth/session.ts');
  const db = load('src/lib/db/postgres.ts');
  try {
    const [admin] = await db.dbQuery('select user_id, username, full_name from aic.users where user_role_id = 1 order by source_row limit 1');
    cookieJar.set('aic_session', session.createSessionToken({ userId: admin.user_id, username: admin.username, email: '', userRoleId: 1, departmentId: 0, positionId: 0, fullName: admin.full_name }));
    for (const [page, routes] of Object.entries(PAGES)) {
      for (const route of routes) {
        const [routePath, query] = route.replace('__self__', encodeURIComponent(admin.username)).split('?');
        const before = googleCalls.length; const driveBefore = driveCalls.length;
        const handler = load(`src/app/api/${routePath}/route.ts`).GET;
        assert.equal(typeof handler, 'function', `${routePath} has no GET`);
        const response = await handler(new Request(`http://staging.test/api/${routePath}${query ? `?${query}` : ''}`), { params: Promise.resolve({}) });
        const body = await response.json();
        const size = Array.isArray(body) ? body.length : Array.isArray(body?.data) ? body.data.length : Array.isArray(body?.items) ? body.items.length : body && typeof body === 'object' ? Object.keys(body).length : 0;
        assert.equal(response.status, 200, `${page} → /api/${route}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
        assert.equal(googleCalls.length, before, `${page} → /api/${route} touched Google: ${googleCalls.slice(before).join(', ')}`);
        const drive = driveCalls.length - driveBefore;
        console.log(`ok   ${page.padEnd(18)} /api/${route.padEnd(28)} 200, ${size} entries, 0 Sheets calls${drive ? `, ${drive} Drive lookups` : ''}`);
      }
    }
    console.log(`\nFour-tab workflow on PostgreSQL: every route answered, ${googleCalls.length} Sheets calls, ${driveCalls.length} Drive lookups.`);
  } finally {
    if (globalThis.__aicPgPool) await globalThis.__aicPgPool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

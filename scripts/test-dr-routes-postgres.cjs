/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// DR routes on PostgreSQL (plan 2026-11-28 Task 8): one transaction per save, replayable requests, outbox
// PDFs. Each case runs inside an outer transaction that is rolled back; the route's own transaction nests
// in it as a savepoint. Google is refused (a Sheets call would fail the route); the scan upload gets a fake Drive.
//   node --env-file=.env.local scripts/test-dr-routes-postgres.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP dr-routes-postgres: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const cookieJar = new Map();
class NextResponse { static json(body, init = {}) { return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json' } }); } }
const baseMocks = {
  'next/headers': { cookies: async () => ({ get: (n) => (cookieJar.has(n) ? { value: cookieJar.get(n) } : undefined), set: () => {}, delete: () => {} }) },
  'next/server': { NextResponse },
};
const h = createHarness(baseMocks);
const db = h.load('src/lib/db/postgres.ts');
const ACTOR = 'test:dr-routes';
const ROLLBACK = new Error('rollback');
const inRolledBack = async (fn) => {
  try { await db.inTransaction(ACTOR, async () => { await fn(); throw ROLLBACK; }); }
  catch (e) { if (e !== ROLLBACK) throw e; return; }
  throw new Error('transaction was not rolled back');
};
const q = (sql, params) => db.txQuery(sql, params);
const post = (harness, body) => harness.load('src/app/api/deliveries/route.ts').POST(new Request('http://t/api/deliveries', { method: 'POST', body: JSON.stringify(body) }));
const put = (dr, body) => h.load('src/app/api/deliveries/[id]/route.ts').PUT(new Request(`http://t/api/deliveries/${dr}`, { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(dr) }) });
const del = (dr) => h.load('src/app/api/deliveries/[id]/route.ts').DELETE(new Request(`http://t/api/deliveries/${dr}`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(dr) }) });

let f;
async function fixture() {
  const [admin] = await db.dbQuery("select user_id, username, full_name from aic.users where user_role_id = 1 and coalesce(full_name,'') <> '' order by source_row limit 1");
  const [company] = await db.dbQuery("select company_id from aic.companies where company_type in ('Customer','Both') and lower(status) = 'active' order by source_row limit 1");
  const [warehouse] = await db.dbQuery('select warehouse_id from aic.warehouses where active order by sort_order nulls last limit 1');
  const products = await db.dbQuery("select p.product_id, p.product_code, p.product_name from aic.products p join aic.product_categories c on c.product_category_id = p.product_category_id where lower(p.status) = 'active' and coalesce(c.track_inventory, false) = false order by p.source_row limit 2");
  cookieJar.set('aic_session', h.load('src/lib/auth/session.ts').createSessionToken({ userId: admin.user_id, username: admin.username, email: '', userRoleId: 1, departmentId: 0, positionId: 0, fullName: admin.full_name }));
  f = { admin, company: company.company_id, warehouse: warehouse?.warehouse_id, products };
}
const body = (marker, overrides = {}) => ({
  companyId: f.company, date: '2026-11-28', trNo: 'TR-ROUTE-TEST', preparedBy: 'Integration Test', deliveredBy: f.admin.full_name,
  deliveredById: f.admin.user_id, deliveredByType: 'internal', comments: marker, warehouseId: f.warehouse,
  items: f.products.map((p, i) => ({ productId: p.product_id, productCode: p.product_code, description: p.product_name, quantity: i + 1, unit: 'PC' })),
  ...overrides,
});
const drFor = async (marker) => q('select dr_number, status from aic.delivery_receipts where comments = $1', [marker]);

run('dr-routes-postgres', [
  ['POST creates the DR with items, handover and a pending PDF job; no Sheets calls', async () => {
    await fixture();
    await inRolledBack(async () => {
      const marker = `route-${randomUUID()}`;
      const res = await post(h, body(marker));
      const json = await res.json();
      assert.equal(res.status, 201, JSON.stringify(json));
      assert.equal(json.pdfStatus, 'pending');
      const [dr] = await drFor(marker);
      assert.equal(dr.dr_number, json.drNumber);
      assert.equal((await q('select count(*)::int n from aic.delivery_receipt_items where dr_number = $1', [json.drNumber]))[0].n, 2);
      assert.equal((await q("select count(*)::int n from aic.outbox where kind = 'dr.pdf' and document_key = $1", [String(json.drNumber)]))[0].n, 1);
    });
  }],
  ['same requestId twice returns the same DR; a different payload under it gets 409', async () => inRolledBack(async () => {
    const marker = `route-${randomUUID()}`;
    const requestId = randomUUID();
    const first = await (await post(h, { ...body(marker), requestId })).json();
    const second = await (await post(h, { ...body(marker), requestId })).json();
    assert.equal(second.drNumber, first.drNumber);
    assert.equal((await drFor(marker)).length, 1, 'retry created a second DR');
    const conflict = await post(h, { ...body(marker, { comments: `${marker}-changed` }), requestId });
    assert.equal(conflict.status, 409);
  })],
  ['failure after the DR insert rolls back every table', async () => inRolledBack(async () => {
    const failing = createHarness({ ...baseMocks, '@/lib/db/outbox': { enqueueSideEffect: async () => { throw new Error('injected outbox failure'); } } });
    const marker = `route-${randomUUID()}`;
    const [{ handovers }] = await q('select count(*)::int handovers from aic.document_handovers');
    const res = await post(failing, body(marker));
    assert.equal(res.status, 500);
    assert.equal((await drFor(marker)).length, 0, 'DR header survived');
    assert.equal((await q('select count(*)::int handovers from aic.document_handovers'))[0].handovers, handovers, 'handover survived');
  })],
  ['PUT promotes a draft and DELETE soft-deletes it; no Sheets calls', async () => inRolledBack(async () => {
    const marker = `route-${randomUUID()}`;
    const draft = await (await post(h, body(marker, { status: 'draft' }))).json();
    assert.ok(draft.drNumber < 0);
    const res = await put(draft.drNumber, { status: 'created', requestId: randomUUID() });
    const promoted = await res.json();
    assert.equal(res.status, 200, JSON.stringify(promoted));
    assert.ok(promoted.drNumber > 0);
    assert.equal((await q('select count(*)::int n from aic.delivery_receipt_items where dr_number = $1', [draft.drNumber]))[0].n, 0);
    const gone = await del(promoted.drNumber);
    assert.equal(gone.status, 200);
    assert.equal((await q('select status from aic.delivery_receipts where dr_number = $1', [promoted.drNumber]))[0].status, 'deleted');
  })],
  ['save-pdf queues the PDF job with the browser-rendered file', async () => inRolledBack(async () => {
    const marker = `route-${randomUUID()}`;
    const created = await (await post(h, body(marker))).json();
    const res = await h.load('src/app/api/deliveries/save-pdf/route.ts').POST(new Request('http://t/api/deliveries/save-pdf', { method: 'POST', body: JSON.stringify({ drNumber: created.drNumber, companyName: 'X', deliveryDate: '2026-11-28', pdfBase64: 'JVBERi0xLjQK' }) }));
    assert.equal(res.status, 202);
    const [job] = await q("select payload->>'pdfBase64' as pdf from aic.outbox where kind = 'dr.pdf' and document_key = $1 and status = 'pending'", [String(created.drNumber)]);
    assert.equal(job.pdf, 'JVBERi0xLjQK');
  })],
  ['upload-scanned records the scan and completes the DR (fake Drive)', async () => {
    // This harness has its own transaction module, so the rollback wrapper and queries must use it too;
    // otherwise its saves commit (they did once: test DRs 4111/4112, removed).
    const drive = { files: { create: async () => ({ data: { id: 'scan-file' } }) }, permissions: { create: async () => ({}) } };
    const withDrive = createHarness({ ...baseMocks, '@/lib/googleSheets': { getDriveUploadClient: async () => drive, findOrCreateDriveFolder: async () => 'folder' } });
    const driveDb = withDrive.load('src/lib/db/postgres.ts');
    const q = (sql, params) => driveDb.txQuery(sql, params);
    const marker = `route-${randomUUID()}`;
    try { await driveDb.inTransaction(ACTOR, async () => {
    const created = await (await post(withDrive, body(marker, { status: 'printed' }))).json();
    const form = new FormData();
    form.append('drNumber', String(created.drNumber));
    form.append('file', new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' }));
    const res = await withDrive.load('src/app/api/deliveries/upload-scanned/route.ts').POST(new Request('http://t/api/deliveries/upload-scanned', { method: 'POST', body: form }));
    const json = await res.json();
    assert.equal(res.status, 200, JSON.stringify(json));
    const [row] = await q('select status, scanned_file_link from aic.delivery_receipts where dr_number = $1', [created.drNumber]);
    assert.deepEqual(row, { status: 'completed', scanned_file_link: 'https://drive.google.com/file/d/scan-file/view' });
    throw ROLLBACK;
    }); } catch (e) { if (e !== ROLLBACK) throw e; }
    const [{ n }] = await db.dbQuery('select count(*)::int n from aic.delivery_receipts where comments = $1', [marker]);
    assert.equal(n, 0, 'the scan test committed its DR');
  }],
  ['no route test leaves a DR behind', async () => {
    const [{ n }] = await db.dbQuery("select count(*)::int n from aic.delivery_receipts where comments like 'route-%'");
    assert.equal(n, 0);
  }],
]).finally(closePool);

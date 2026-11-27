/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// DR header, items and status history writes on PostgreSQL (plan 2026-11-28 Task 4).
// Each case runs in a transaction that is rolled back; Google is refused by the harness.
//   node --env-file=.env.local scripts/test-dr-writes-postgres.cjs
const assert = require('node:assert/strict');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP dr-writes-postgres: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const h = createHarness({ 'next/headers': { cookies: async () => ({ get: () => undefined }) } });
const db = h.load('src/lib/db/postgres.ts');
const dr = h.load('src/lib/deliverySheets.ts');
const ACTOR = 'test:dr-writes';
const ROLLBACK = new Error('rollback');
const inRolledBack = async (fn) => {
  try { await db.inTransaction(ACTOR, async () => { await fn(); throw ROLLBACK; }); }
  catch (e) { if (e !== ROLLBACK) throw e; return; }
  throw new Error('transaction was not rolled back');
};
const q = (sql, params) => db.txQuery(sql, params);

let fixture;
async function loadFixture() {
  const [company] = await db.dbQuery("select company_id from aic.companies where company_type in ('Customer', 'Both') and lower(status) = 'active' order by source_row limit 1");
  const [holder] = await db.dbQuery("select user_id, full_name from aic.users where coalesce(full_name, '') <> '' order by source_row limit 1");
  const products = await db.dbQuery("select product_id, product_code, product_name from aic.products where lower(status) = 'active' order by source_row limit 3");
  const [{ max }] = await db.dbQuery('select max(dr_number) as max from aic.delivery_receipts where dr_number > 0');
  fixture = { company: company.company_id, holder, products, nextNumber: Math.max(Number(max), 3642) + 1 };
}
const item = (p, quantity) => ({ productId: p.product_id, productCode: p.product_code, description: p.product_name, quantity, unit: 'PC' });
const payload = (overrides = {}) => ({
  companyId: fixture.company, date: '2026-11-28', trNo: 'TR-TEST-1', preparedBy: 'Integration Test',
  deliveredBy: fixture.holder.full_name, deliveredById: fixture.holder.user_id, deliveredByType: 'internal',
  comments: 'integration test', items: [item(fixture.products[0], 2), item(fixture.products[1], 1)], ...overrides,
});
const items = (n) => q('select item_no, product_id, quantity::text from aic.delivery_receipt_items where dr_number = $1 order by item_no', [n]);

run('dr-writes-postgres', [
  ['create finalized DR gets next number, items, handover and a pending PDF job', async () => {
    await loadFixture();
    await inRolledBack(async () => {
      const result = await dr.processDeliveryReceipt(payload(), ACTOR);
      assert.equal(result.drNumber, fixture.nextNumber);
      assert.equal(result.pdfBase64, undefined);
      const [header] = await q('select status, company_id, sales_order_no, comments, created_by from aic.delivery_receipts where dr_number = $1', [result.drNumber]);
      assert.deepEqual(header, { status: 'created', company_id: fixture.company, sales_order_no: 'TR-TEST-1', comments: 'integration test', created_by: ACTOR });
      assert.deepEqual(await items(result.drNumber), [
        { item_no: 1, product_id: fixture.products[0].product_id, quantity: '2' },
        { item_no: 2, product_id: fixture.products[1].product_id, quantity: '1' },
      ]);
      assert.equal((await q('select count(*)::int n from aic.delivery_receipt_status_history where dr_number = $1', [result.drNumber]))[0].n, 0, 'no history row on create, as on Sheets');
      assert.equal((await q("select count(*)::int n from aic.document_handovers where document_type = 'delivery_receipt' and document_number = $1", [String(result.drNumber)]))[0].n, 1);
      assert.equal((await q("select count(*)::int n from aic.outbox where kind = 'dr.pdf' and document_key = $1 and status = 'pending'", [String(result.drNumber)]))[0].n, 1);
    });
  }],
  ['create draft keeps a negative placeholder and enqueues no PDF', async () => inRolledBack(async () => {
    const result = await dr.processDeliveryReceipt(payload({ status: 'draft' }), ACTOR);
    assert.ok(result.drNumber < 0);
    assert.equal((await items(result.drNumber)).length, 2);
    assert.equal((await q("select count(*)::int n from aic.outbox where document_key = $1", [String(result.drNumber)]))[0].n, 0);
    assert.equal((await q("select count(*)::int n from aic.document_handovers where document_number = $1", [String(result.drNumber)]))[0].n, 0);
  })],
  ['manual DR number that already exists is refused', async () => inRolledBack(async () => {
    const [{ dr_number }] = await q('select dr_number from aic.delivery_receipts where dr_number > 0 order by dr_number desc limit 1');
    await assert.rejects(dr.processDeliveryReceipt(payload({ drNumber: dr_number }), ACTOR), /already exists/);
  })],
  ['promote draft with edited items leaves no placeholder rows', async () => inRolledBack(async () => {
    const draft = await dr.processDeliveryReceipt(payload({ status: 'draft' }), ACTOR);
    const promoted = await dr.updateDeliveryReceipt(draft.drNumber, { status: 'printed', items: [item(fixture.products[2], 5)] }, ACTOR);
    assert.equal(promoted.drNumber, fixture.nextNumber);
    assert.deepEqual(await items(promoted.drNumber), [{ item_no: 1, product_id: fixture.products[2].product_id, quantity: '5' }]);
    assert.equal((await items(draft.drNumber)).length, 0, 'placeholder items remain');
    assert.equal((await q('select count(*)::int n from aic.delivery_receipts where dr_number = $1', [draft.drNumber]))[0].n, 0);
    const history = await q('select old_status, new_status from aic.delivery_receipt_status_history where dr_number = $1', [promoted.drNumber]);
    assert.deepEqual(history, [{ old_status: 'draft', new_status: 'printed' }]);
  })],
  ['promote draft without items re-keys existing items', async () => inRolledBack(async () => {
    const draft = await dr.processDeliveryReceipt(payload({ status: 'draft' }), ACTOR);
    const promoted = await dr.updateDeliveryReceipt(draft.drNumber, { status: 'created' }, ACTOR);
    assert.equal((await items(promoted.drNumber)).length, 2);
    assert.equal((await items(draft.drNumber)).length, 0);
  })],
  ['edit updates the header and returns the summary shape', async () => inRolledBack(async () => {
    const created = await dr.processDeliveryReceipt(payload(), ACTOR);
    const edited = await dr.updateDeliveryReceipt(created.drNumber, { comments: 'edited by test' }, ACTOR);
    for (const key of ['drNumber', 'date', 'companyId', 'companyName', 'status', 'items', 'deliveredBy', 'updatedAt']) assert.ok(key in edited, `missing ${key}`);
    assert.equal(edited.comments, 'edited by test');
    const [row] = await q('select comments, updated_by from aic.delivery_receipts where dr_number = $1', [created.drNumber]);
    assert.deepEqual(row, { comments: 'edited by test', updated_by: ACTOR });
  })],
  ['delete soft-deletes the header, removes items and marks releases Deleted', async () => inRolledBack(async () => {
    const created = await dr.processDeliveryReceipt(payload(), ACTOR);
    const [ci] = await q('select contract_item_id, contract_id from aic.contract_items where contract_id is not null limit 1');
    await q("insert into aic.contract_releases (release_id, contract_item_id, contract_id, status, dr_number) values ('REL-TEST-DEL', $1, $2, 'Completed', $3)", [ci.contract_item_id, ci.contract_id, created.drNumber]);
    await dr.deleteDeliveryReceipt(created.drNumber, { userId: ACTOR, displayName: 'Test' }, 1);
    const [header] = await q('select status from aic.delivery_receipts where dr_number = $1', [created.drNumber]);
    assert.equal(header.status, 'deleted');
    assert.equal((await items(created.drNumber)).length, 0);
    assert.equal((await q("select status from aic.contract_releases where release_id = 'REL-TEST-DEL'"))[0].status, 'Deleted');
  })],
  ['nothing persisted', async () => {
    const [{ n }] = await db.dbQuery("select count(*)::int n from aic.delivery_receipts where comments in ('integration test', 'edited by test')");
    assert.equal(n, 0);
  }],
]).finally(closePool);

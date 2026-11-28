/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// Contract releases, inventory lock and the stock-check reads on PostgreSQL (plan 2026-11-28 Task 5).
// Writes run in transactions that are rolled back.
//   node --env-file=.env.local scripts/test-releases-inventory-postgres.cjs
const assert = require('node:assert/strict');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP releases-inventory-postgres: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const h = createHarness({ 'next/headers': { cookies: async () => ({ get: () => undefined }) } });
const db = h.load('src/lib/db/postgres.ts');
const releases = h.load('src/lib/contractReleaseSheets.ts');
const { withInventoryLock } = h.load('src/lib/inventory/lock.ts');
const inventory = h.load('src/lib/inventory/sheets.ts');
const { getPositions } = h.load('src/lib/positionSheets.ts');
const ACTOR = 'test:releases-inventory';
const ROLLBACK = new Error('rollback');
const inRolledBack = async (fn) => {
  try { await db.inTransaction(ACTOR, async () => { await fn(); throw ROLLBACK; }); }
  catch (e) { if (e !== ROLLBACK) throw e; return; }
  throw new Error('transaction was not rolled back');
};
const release = (item, id, drNumber) => ({ id, contractItemId: item.contract_item_id, contractId: item.contract_id, periodYear: 2026, periodMonth: 11, periodQuarter: 4, frequency: 'Monthly', releaseDate: '2026-11-28', quantity: 2, releasedBy: 'Integration Test', remarks: '', status: 'Completed', drNumber });

run('releases-inventory-postgres', [
  ['contract DR creates releases in the same transaction', async () => {
    const [item] = await db.dbQuery('select contract_item_id, contract_id from aic.contract_items where contract_id is not null order by source_row limit 1');
    const [{ max }] = await db.dbQuery("select max(substring(release_id from 5)::int) as max from aic.contract_releases where release_id ~ '^REL-[0-9]+$'");
    await inRolledBack(async () => {
      const nextId = await releases.generateReleaseId();
      assert.equal(nextId, `REL-${String(Number(max) + 1).padStart(4, '0')}`);
      await releases.appendContractReleases([release(item, nextId, 999998), release(item, `REL-${String(Number(max) + 2).padStart(4, '0')}`, 999998)]);
      const rows = await db.txQuery('select release_id, quantity::text, status from aic.contract_releases where dr_number = 999998 order by release_id');
      assert.equal(rows.length, 2);
      assert.deepEqual(rows[0], { release_id: nextId, quantity: '2', status: 'Completed' });
    });
    const [{ n }] = await db.dbQuery('select count(*)::int n from aic.contract_releases where dr_number = 999998');
    assert.equal(n, 0, 'rolled back with the transaction');
  }],
  ['deleting the DR marks its releases Deleted', async () => {
    const [item] = await db.dbQuery('select contract_item_id, contract_id from aic.contract_items where contract_id is not null order by source_row limit 1');
    await inRolledBack(async () => {
      await releases.appendContractReleases([release(item, 'REL-TEST-1', 999997), { ...release(item, 'REL-TEST-2', 999997), status: 'Cancelled' }]);
      await releases.markDrReleasesDeleted(999997);
      const rows = await db.txQuery('select release_id, status from aic.contract_releases where dr_number = 999997 order by release_id');
      assert.deepEqual(rows, [{ release_id: 'REL-TEST-1', status: 'Deleted' }, { release_id: 'REL-TEST-2', status: 'Cancelled' }]);
    });
  }],
  ['inventory lock serialises two stock-affecting saves', async () => {
    const spans = [];
    const save = (label) => db.inTransaction(ACTOR, () => withInventoryLock(async () => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, 400));
      spans.push({ label, start, end: Date.now() });
    }));
    await Promise.all([save('a'), save('b')]);
    const [first, second] = spans.sort((x, y) => x.start - y.start);
    assert.ok(second.start >= first.end, `overlapped: ${JSON.stringify(spans)}`);
  }],
  ['releases, positions and stock reads come from the database', async () => {
    const [{ r, p, m }] = await db.dbQuery('select (select count(*) from aic.contract_releases)::int r, (select count(*) from aic.positions)::int p, (select count(*) from aic.stock_movements)::int m');
    assert.equal((await releases.getContractReleases()).length, r);
    assert.equal((await getPositions()).length, p);
    assert.equal((await inventory.listMovements()).length, m);
    assert.ok((await inventory.listDrStockLines()).length > 0);
  }],
  // Final review, Important 4: a contract-releasing DR and a no-charge switch must not read Google Sheets.
  ['contracts, contract items and DR-linked invoices read from the database', async () => {
    const [{ c, i }] = await db.dbQuery('select (select count(*) from aic.contracts)::int c, (select count(*) from aic.contract_items)::int i');
    assert.equal((await h.load('src/lib/contractSheets.ts').getContracts()).length, c);
    assert.equal((await h.load('src/lib/contractItemSheets.ts').getContractItems()).length, i);
    const [{ dr_number, invoice_no }] = await db.dbQuery("select dr_number, invoice_no from aic.service_invoices where dr_number is not null and coalesce(status, '') not in ('cancelled', 'void', 'deleted') limit 1");
    const linked = await h.load('src/lib/invoiceRepository.ts').readDrLinkedInvoiceNumbers(dr_number);
    assert.ok(linked.includes(invoice_no), `${invoice_no} not among ${linked}`);
  }],
]).finally(closePool);

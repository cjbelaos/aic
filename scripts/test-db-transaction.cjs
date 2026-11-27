/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// Request-scoped transactions (plan 2026-11-28 Task 1). Uses a temporary table, so nothing persists.
//   node --env-file=.env.local scripts/test-db-transaction.cjs
const assert = require('node:assert/strict');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP db-transaction: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const db = createHarness().load('src/lib/db/postgres.ts');

// A temp table lives on one session; the pooler gives each transaction its own, so create it per test inside the outer transaction.
const scratch = () => db.txQuery('create temp table if not exists tx_scratch (v text) on commit drop');
const rows = async () => (await db.txQuery('select v from tx_scratch order by v')).map((r) => r.v);
const rollback = new Error('rollback test transaction');

run('db-transaction', [
  ['nested inTransaction joins the outer transaction', async () => {
    await assert.rejects(db.inTransaction('test:tx', async () => {
      await scratch();
      await db.txQuery("insert into tx_scratch values ('outer')");
      await db.inTransaction('test:tx', () => db.txQuery("insert into tx_scratch values ('inner')"));
      assert.deepEqual(await rows(), ['inner', 'outer']);
      throw rollback;
    }), (e) => e === rollback);
  }],
  ['inner failure rolls back to its savepoint only', async () => {
    await db.inTransaction('test:tx', async () => {
      await scratch();
      await db.txQuery("insert into tx_scratch values ('outer')");
      await assert.rejects(db.inTransaction('test:tx', async () => {
        await db.txQuery("insert into tx_scratch values ('inner')");
        throw new Error('inner fails');
      }), /inner fails/);
      assert.deepEqual(await rows(), ['outer']);
    });
  }],
  ['txQuery outside a transaction throws', async () => {
    await assert.rejects(db.txQuery('select 1'), /No database transaction is open/);
  }],
  ['actor is set once for the outer transaction', async () => {
    await db.inTransaction('test:outer-actor', async () => {
      await db.inTransaction('test:inner-actor', async () => {
        const [{ actor }] = await db.txQuery("select current_setting('aic.actor') as actor");
        assert.equal(actor, 'test:outer-actor');
        assert.equal(db.currentActor(), 'test:outer-actor');
      });
    });
    assert.equal(db.currentActor(), undefined);
  }],
  ['withTransaction still hands the work a client', async () => {
    const value = await db.withTransaction('test:tx', async (client) => (await client.query('select 41 + 1 as v')).rows[0].v);
    assert.equal(value, 42);
  }],
]).finally(closePool);

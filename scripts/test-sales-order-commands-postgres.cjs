/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// Sales-order command writer on PostgreSQL (plan 2026-11-28 Task 7). Every case runs in a transaction that
// is rolled back; Google is refused by the harness.
//   node --env-file=.env.local scripts/test-sales-order-commands-postgres.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP sales-order-commands-postgres: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const h = createHarness({ 'next/headers': { cookies: async () => ({ get: () => undefined }) } });
const db = h.load('src/lib/db/postgres.ts');
const repo = h.load('src/lib/salesOrders/repository.ts');
const ACTOR = 'test:so-commands';
const ROLLBACK = new Error('rollback');
const inRolledBack = async (fn) => {
  try { await db.inTransaction(ACTOR, async () => { await fn(); throw ROLLBACK; }); }
  catch (e) { if (e !== ROLLBACK) throw e; return; }
  throw new Error('transaction was not rolled back');
};
const command = (overrides) => ({ commandId: `test-${randomUUID()}`, commandType: 'so.update', salesOrderId: null, expectedVersion: null, actorUserId: ACTOR, requestHash: 'hash-1', payload: {}, ...overrides });

let sample;
const loadSample = async () => {
  const orders = await repo.readSalesOrders();
  sample = orders.find((o) => o.orderStatus === 'CONFIRMED' && o.version >= 1) ?? orders[0];
};

run('sales-order-commands-postgres', [
  ['update writes the order and its command record; a replay returns the stored result', async () => {
    await loadSample();
    await inRolledBack(async () => {
      const cmd = command({ salesOrderId: sample.salesOrderId, expectedVersion: sample.version, payload: { order: { ...sample, remarks: 'edited by test' } } });
      const first = await repo.writeSalesOrderCommand(cmd);
      assert.equal(first.replayed, false);
      const [row] = await db.txQuery('select remarks, version, updated_by from aic.sales_orders where sales_order_id = $1', [sample.salesOrderId]);
      assert.deepEqual(row, { remarks: 'edited by test', version: sample.version + 1, updated_by: ACTOR });
      const [receipt] = await db.txQuery('select payload_hash, actor_user_id from aic.sales_order_commands where command_id = $1', [cmd.commandId]);
      assert.deepEqual(receipt, { payload_hash: 'hash-1', actor_user_id: ACTOR });
      const replay = await repo.writeSalesOrderCommand(cmd);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.result, first.result);
      await assert.rejects(repo.writeSalesOrderCommand({ ...cmd, requestHash: 'hash-2' }), /already used with different content/);
    });
  }],
  ['version conflict is reported', async () => inRolledBack(async () => {
    await assert.rejects(
      repo.writeSalesOrderCommand(command({ salesOrderId: sample.salesOrderId, expectedVersion: sample.version - 1, payload: { order: { ...sample } } })),
      /Version conflict/,
    );
  })],
  ['create + confirm assigns the next AIC-SO number and bumps the sequence', async () => inRolledBack(async () => {
    const [{ last_number }] = await db.txQuery("select last_number from aic.sales_order_sequences where sequence_key = 'AIC-SO-2026'");
    const salesOrderId = randomUUID();
    const order = { ...sample, salesOrderId, salesOrderNo: '', orderStatus: 'CONFIRMED', version: 1, receivedDate: '2026-11-28' };
    const result = await repo.writeSalesOrderCommand(command({ commandType: 'so.create', payload: { order, receivedDate: '2026-11-28', items: [] } }));
    assert.equal(result.replayed, false);
    const expected = `AIC-SO-2026-${String(last_number + 1).padStart(4, '0')}`;
    const [row] = await db.txQuery('select sales_order_no from aic.sales_orders where sales_order_id = $1', [salesOrderId]);
    assert.equal(row.sales_order_no, expected);
    const [seq] = await db.txQuery("select last_number from aic.sales_order_sequences where sequence_key = 'AIC-SO-2026'");
    assert.equal(seq.last_number, last_number + 1);
  })],
  ['a command inside a rolled-back save leaves nothing behind', async () => {
    const cmd = command({ salesOrderId: sample.salesOrderId, expectedVersion: sample.version, payload: { order: { ...sample, remarks: 'should not persist' } } });
    await inRolledBack(() => repo.writeSalesOrderCommand(cmd));
    const [{ n }] = await db.dbQuery('select count(*)::int n from aic.sales_order_commands where command_id = $1', [cmd.commandId]);
    assert.equal(n, 0);
  }],
]).finally(closePool);

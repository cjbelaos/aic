/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// Idempotent requests (plan 2026-11-28 Task 2). Each test uses a fresh request id and deletes its rows.
//   node --env-file=.env.local scripts/test-db-idempotency.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP db-idempotency: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const h = createHarness();
const db = h.load('src/lib/db/postgres.ts');
const { withIdempotency, IdempotencyConflictError } = h.load('src/lib/db/idempotency.ts');
const ACTOR = 'test:idempotency';
const used = [];
const id = () => { const value = `test-${randomUUID()}`; used.push(value); return value; };
const save = (requestId, payload, work) => db.inTransaction(ACTOR, () => withIdempotency(requestId, 'test.save', payload, work));

run('db-idempotency', [
  ['first call runs work and stores result', async () => {
    const requestId = id();
    const result = await save(requestId, { a: 1 }, async () => ({ drNumber: 9001 }));
    assert.deepEqual(result, { drNumber: 9001 });
    const [row] = await db.dbQuery('select scope, actor, result from aic.request_log where request_id = $1', [requestId]);
    assert.deepEqual(row, { scope: 'test.save', actor: ACTOR, result: { drNumber: 9001 } });
  }],
  ['replay returns stored result without running work', async () => {
    const requestId = id();
    let runs = 0;
    const work = async () => ({ n: ++runs });
    await save(requestId, { b: [1, 2], a: 1 }, work);
    const replay = await save(requestId, { a: 1, b: [1, 2] }, work); // same payload, different key order
    assert.deepEqual(replay, { n: 1 });
    assert.equal(runs, 1);
  }],
  ['different payload same id → 409', async () => {
    const requestId = id();
    await save(requestId, { a: 1 }, async () => ({ ok: true }));
    await assert.rejects(save(requestId, { a: 2 }, async () => ({ ok: true })), (e) => e instanceof IdempotencyConflictError && e.status === 409 && /already used for a different save/.test(e.message));
  }],
  ['no request id simply runs work', async () => {
    let runs = 0;
    await save(undefined, { a: 1 }, async () => ++runs);
    await save(undefined, { a: 1 }, async () => ++runs);
    assert.equal(runs, 2);
  }],
  ['failed work stores nothing, so a retry runs again', async () => {
    const requestId = id();
    await assert.rejects(save(requestId, { a: 1 }, async () => { throw new Error('save failed'); }), /save failed/);
    assert.deepEqual(await save(requestId, { a: 1 }, async () => ({ second: true })), { second: true });
  }],
  ['concurrent duplicate waits and replays', async () => {
    const requestId = id();
    let runs = 0;
    const slow = async () => { runs++; await new Promise((r) => setTimeout(r, 400)); return { winner: runs }; };
    const [a, b] = await Promise.all([save(requestId, { a: 1 }, slow), save(requestId, { a: 1 }, slow)]);
    assert.equal(runs, 1);
    assert.deepEqual(a, { winner: 1 });
    assert.deepEqual(b, { winner: 1 });
  }],
]).finally(async () => {
  if (used.length) await db.withTransaction(ACTOR, (c) => c.query('delete from aic.request_log where request_id = any($1)', [used])).catch(() => {});
  await closePool();
});

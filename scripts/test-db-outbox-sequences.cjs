/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// DR numbering under lock and the side-effect outbox (plan 2026-11-28 Task 3).
// The numbering test commits scratch DRs (status 'test') and deletes them afterwards (ledger ruling).
//   node --env-file=.env.local scripts/test-db-outbox-sequences.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP db-outbox-sequences: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const h = createHarness();
const db = h.load('src/lib/db/postgres.ts');
const { nextDrNumber } = h.load('src/lib/db/sequences.ts');
const { enqueueSideEffect, runPendingSideEffects } = h.load('src/lib/db/outbox.ts');
const ACTOR = 'test:outbox-sequences';
const KIND = 'test.outbox'; // test-only kind: never claims real jobs
const createdDrs = [];

const pendingFor = async (key) => db.dbQuery('select status, attempts, last_error, payload from aic.outbox where kind = $1 and document_key = $2 order by id', [KIND, key]);

run('db-outbox-sequences', [
  ['next DR number follows the highest real DR, floor 3642', async () => {
    const [{ max }] = await db.dbQuery('select max(dr_number) as max from aic.delivery_receipts where dr_number > 0');
    const next = await db.inTransaction(ACTOR, () => nextDrNumber());
    assert.equal(next, Math.max(Number(max ?? 0), 3642) + 1);
  }],
  ['concurrent creates get distinct consecutive numbers', async () => {
    const numbers = await Promise.all(Array.from({ length: 5 }, () => db.inTransaction(ACTOR, async () => {
      const n = await nextDrNumber();
      await db.txQuery("insert into aic.delivery_receipts (dr_number, status) values ($1, 'test')", [n]);
      createdDrs.push(n);
      return n;
    })));
    const sorted = [...numbers].sort((a, b) => a - b);
    assert.equal(new Set(numbers).size, 5, `duplicates in ${numbers}`);
    sorted.forEach((n, i) => assert.equal(n, sorted[0] + i, `not consecutive: ${sorted}`));
  }],
  ['nextDrNumber outside a transaction throws', async () => {
    await assert.rejects(nextDrNumber(), /No database transaction is open/);
  }],
  ['enqueue twice for the same document keeps one pending job with the latest payload', async () => {
    const key = `test-${randomUUID()}`;
    await db.inTransaction(ACTOR, () => enqueueSideEffect(KIND, key, { v: 1 }));
    await db.inTransaction(ACTOR, () => enqueueSideEffect(KIND, key, { v: 2 }));
    const jobs = await pendingFor(key);
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].payload, { v: 2 });
  }],
  ['failed handler keeps the job pending with attempts=1 and last_error set', async () => {
    const key = `test-${randomUUID()}`;
    await db.inTransaction(ACTOR, () => enqueueSideEffect(KIND, key, {}));
    const outcome = await runPendingSideEffects(KIND, async (job) => { if (job.document_key === key) throw new Error('Drive unavailable'); });
    assert.ok(outcome.failed >= 1);
    const [job] = await pendingFor(key);
    assert.equal(job.status, 'pending');
    assert.equal(job.attempts, 1);
    assert.match(job.last_error, /Drive unavailable/);
  }],
  ['successful handler marks the job done', async () => {
    const key = `test-${randomUUID()}`;
    await db.inTransaction(ACTOR, () => enqueueSideEffect(KIND, key, {}));
    await runPendingSideEffects(KIND, async () => {});
    const [job] = await pendingFor(key);
    assert.equal(job.status, 'done');
  }],
  ['two workers never claim the same job', async () => {
    const keys = Array.from({ length: 4 }, () => `test-${randomUUID()}`);
    for (const key of keys) await db.inTransaction(ACTOR, () => enqueueSideEffect(KIND, key, {}));
    const seen = [];
    const handler = async (job) => { if (keys.includes(job.document_key)) { seen.push(job.document_key); await new Promise((r) => setTimeout(r, 150)); } };
    await Promise.all([runPendingSideEffects(KIND, handler, 10), runPendingSideEffects(KIND, handler, 10)]);
    assert.equal(seen.length, new Set(seen).size, 'a job was handled twice');
    assert.deepEqual([...seen].sort(), [...keys].sort());
  }],
]).finally(async () => {
  await db.withTransaction(ACTOR, async (c) => {
    if (createdDrs.length) await c.query("delete from aic.delivery_receipts where status = 'test' and dr_number = any($1)", [createdDrs]);
    await c.query('delete from aic.outbox where kind = $1', [KIND]);
  }).catch((e) => console.log('cleanup failed:', e.message));
  await closePool();
});

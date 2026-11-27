/* eslint-disable @typescript-eslint/no-require-imports -- Integration test against the staging database. */
// Document handover writes on PostgreSQL (plan 2026-11-28 Task 6). Every case runs in a transaction that is rolled back.
//   node --env-file=.env.local scripts/test-handover-postgres.cjs
const assert = require('node:assert/strict');
const { createHarness, usePostgresStaging, closePool, run } = require('./lib/ts-harness.cjs');

if (!usePostgresStaging()) { console.log('SKIP handover-postgres: no STAGING_APP_DATABASE_URL'); process.exit(0); }
const h = createHarness({ 'next/headers': { cookies: async () => ({ get: () => undefined }) } });
const db = h.load('src/lib/db/postgres.ts');
const { commitDocumentWithHandover } = h.load('src/lib/documentHandoverCommit.ts');
const { getDocumentHandovers, returnDocumentFromScan } = h.load('src/lib/documentHandoverSheets.ts');
const ACTOR = 'test:handover';
const ROLLBACK = new Error('rollback');
const inRolledBack = async (fn) => {
  try { await db.inTransaction(ACTOR, async () => { await fn(); throw ROLLBACK; }); }
  catch (e) { if (e !== ROLLBACK) throw e; return; }
  throw new Error('transaction was not rolled back');
};
const DOC = '987654';
const handovers = () => db.txQuery("select technician_id, technician_name, status from aic.document_handovers where document_type = 'delivery_receipt' and document_number = $1", [DOC]);

let holder;
const assignment = (overrides = {}) => ({ documentType: 'delivery_receipt', documentNumber: DOC, customerName: 'Test Customer', assignedToId: holder.user_id, assignedToName: holder.full_name, assigneeType: 'internal', assignedBy: ACTOR, assignedByName: 'Integration Test', ...overrides });
const SOURCE = { sheet: 'DeliveryReceipts', row: [] };

run('handover-postgres', [
  ['handover key is unique in the database', async () => {
    [holder] = await db.dbQuery("select user_id, full_name from aic.users where coalesce(full_name, '') <> '' order by source_row limit 1");
    const [{ unique }] = await db.dbQuery("select count(*) > 0 as unique from pg_indexes where schemaname = 'aic' and tablename = 'document_handovers' and indexdef ilike '%unique%document_type%document_number%'");
    assert.equal(unique, true);
  }],
  ['finalizing a DR creates one handover', async () => inRolledBack(async () => {
    assert.equal(await commitDocumentWithHandover(SOURCE, assignment()), 'created');
    const rows = await handovers();
    assert.deepEqual(rows, [{ technician_id: holder.user_id, technician_name: holder.full_name, status: 'handed_over' }]);
  })],
  ['re-saving does not duplicate it', async () => inRolledBack(async () => {
    await commitDocumentWithHandover(SOURCE, assignment());
    assert.equal(await commitDocumentWithHandover(SOURCE, assignment()), 'unchanged');
    assert.equal((await handovers()).length, 1);
  })],
  ['a changed holder updates the open handover', async () => inRolledBack(async () => {
    await commitDocumentWithHandover(SOURCE, assignment());
    assert.equal(await commitDocumentWithHandover(SOURCE, assignment({ assignedToId: '', assignedToName: 'Courier Co', assigneeType: 'external' })), 'updated');
    assert.equal((await handovers())[0].technician_name, 'Courier Co');
  })],
  ['a manual custody decision is preserved', async () => inRolledBack(async () => {
    await commitDocumentWithHandover(SOURCE, assignment());
    await db.txQuery("update aic.document_handovers set status = 'received_by_after_sales' where document_type = 'delivery_receipt' and document_number = $1", [DOC]);
    await commitDocumentWithHandover(SOURCE, assignment({ assignedToId: '', assignedToName: 'Someone Else', assigneeType: 'external' }));
    assert.equal((await handovers())[0].technician_name, holder.full_name);
  })],
  ['recovery without a source never changes an existing record', async () => inRolledBack(async () => {
    await commitDocumentWithHandover(SOURCE, assignment());
    assert.equal(await commitDocumentWithHandover(undefined, assignment({ assignedToName: 'Other', assignedToId: '', assigneeType: 'external' })), 'unchanged');
  })],
  ['handover list reads from the database', async () => {
    const all = await getDocumentHandovers();
    const [{ n }] = await db.dbQuery('select count(*)::int n from aic.document_handovers');
    assert.equal(all.length, n);
  }],
  ['a scan return marks the handover returned', async () => inRolledBack(async () => {
    await commitDocumentWithHandover(SOURCE, assignment());
    // Only the designated receive-and-verify user may auto-return a document (documentHandoverWorkflow.ts).
    const { DOCUMENT_RECEIVE_AND_VERIFY_USER_ID } = h.load('src/lib/documentHandoverWorkflow.ts');
    const actor = { userId: DOCUMENT_RECEIVE_AND_VERIFY_USER_ID, fullName: 'Integration Test', userRoleId: 1 };
    const outcome = await returnDocumentFromScan({ documentType: 'delivery_receipt', documentNumber: DOC, actor });
    assert.notEqual(outcome, 'not_permitted');
    assert.equal((await handovers())[0].status, 'returned');
  })],
]).finally(closePool);

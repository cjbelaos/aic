/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { load } = require('./test-fti-recalculation.cjs');
(async () => {
  let held = false, queued = 0;
  const rows = [['R1', 'u', 'DRAFT', '', 'https://drive.google.com/file/d/file/view', 0]];
  const writes = [];
  const sheets = { spreadsheets: { values: {
    get: async ({ range }) => ({ data: { values: range.startsWith('FTIRequests') ? rows : [] } }),
    update: async ({ range, requestBody }) => { assert.ok(held); writes.push(range); if (range.includes('!L')) queued++; if (range === 'FTIRequests!C2') rows[0][2] = requestBody.values[0][0]; },
    append: async () => { assert.ok(held, 'Legacy submission must acquire the lock before appending requests'); throw new Error('stop after locked append'); },
  } } };
  const fti = load('src/lib/ftiSheets.ts', {
    '@/lib/ftiWriteLock': { withFTIWriteLock: async work => { const prior = held; held = true; try { return await work(); } finally { held = prior; } }, isFTIWriteLocked: () => held },
    '@/lib/ftiRevision': { ftiRevision: () => 'revision' },
    '@/lib/ftiRecalculation': { ensureFTIWorkflowSchema: async () => {} },
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'db' },
    '@/lib/userSheets': { getUsers: async () => [] },
    '@/lib/userApproverSheets': {}, '@/lib/miscellaneousSheets': {}, '@/lib/companySheets': {}, '@/lib/tollMatrix': {}, '@/lib/ftiFuelPrice': {},
    '@/types/fti': load('src/types/fti.ts'),
  });
  await fti.updateFTIRequestStatus('R1', 'DRAFT');
  assert.equal(queued, 1, 'A linked PDF must be queued when an editable request changes');
  await assert.rejects(fti.submitFTIEntries([{ ftiRef: 'NEW', technician: 'tech' }]), /stop after locked append/);
  console.log('FTI PDF invalidation and legacy locking tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

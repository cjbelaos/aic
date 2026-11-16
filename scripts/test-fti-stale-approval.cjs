/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { load } = require('./test-fti-recalculation.cjs');
(async () => {
  let writes = 0;
  const full = { controlNo: 'R1', userId: 'owner', status: 'SENT', revision: 'new', totalAmount: 792, details: [] };
  const route = load('src/app/api/fti/requests/[controlNo]/route.ts', {
    'next/server': { ...require('next/server'), after: () => {} },
    '@/types/fti': load('src/types/fti.ts'),
    '@/lib/auth/session': { getSession: async () => ({ userId: 'approver', userRoleId: 1 }) },
    '@/lib/ftiWriteLock': { withFTIWriteLock: async work => work(), FTIWriteConflict: class extends Error {} },
    '@/lib/ftiPdfJobs': { processFTIPdfJobs: async () => ({}) },
    '@/lib/userSheets': { getUserById: async () => ({ fullName: 'Approver' }) },
    '@/lib/userApproverSheets': { getUserApprovers: async () => [] },
    '@/lib/ftiSheets': { getFTIRequestFull: async () => full, updateFTIApproval: async () => writes++, FTIApproverRequiredError: class extends Error {} },
  });
  const context = { params: Promise.resolve({ controlNo: 'R1' }) };
  for (const expectedRevision of [undefined, 'old']) {
    const response = await route.PATCH({ json: async () => ({ action: 'approve', expectedRevision }) }, context);
    assert.equal(response.status, 409, 'Missing/stale revision must reject approval');
    assert.equal(writes, 0, 'Stale approval cannot write status or PDF');
  }
  assert.equal((await route.PATCH({ json: async () => ({ action: 'approve', expectedRevision: 'new' }) }, context)).status, 200);
  assert.equal(writes, 1);
  console.log('FTI stale approval tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

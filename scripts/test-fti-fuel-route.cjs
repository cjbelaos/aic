/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { load } = require('./test-fti-recalculation.cjs');
(async () => {
  let allowed = false, writes = 0, scheduled = 0;
  const route = load('src/app/api/fti/fuel-price/route.ts', {
    'next/server': { ...require('next/server'), after: () => scheduled++ },
    '@/lib/auth/session': { requireAuthenticatedSession: async () => ({ userId: 'manager' }) },
    '@/lib/technicianEarningsAccess': { canManageFuelPrice: async () => allowed },
    '@/lib/ftiFuelPrice': { setGlobalFuelPrice: async price => { writes++; return { fuelPrice: price, affectedTrips: 2, affectedRequests: 1, pendingPdfs: 1 }; } },
    '@/lib/ftiPdfJobs': { processFTIPdfJobs: async () => ({}) },
    '@/lib/ftiSheets': { invalidateFTICache: () => {} },
    '@/lib/ftiWriteLock': { FTIWriteConflict: class extends Error {} },
  });
  const put = fuelPrice => route.PUT({ json: async () => ({ fuelPrice }) });
  assert.equal((await put(79.2)).status, 403); assert.equal(writes, 0);
  allowed = true;
  for (const value of [0, -1, NaN, Infinity, '79.2', null, true]) {
    assert.equal((await put(value)).status, 400); assert.equal(writes, 0);
  }
  const result = await put(79.2);
  assert.equal(result.status, 200); assert.equal(writes, 1); assert.equal(scheduled, 1);
  assert.deepEqual(await result.json(), { fuelPrice: 79.2, affectedTrips: 2, affectedRequests: 1, pendingPdfs: 1 });

  let queued = 0;
  const pdfRoute = load('src/app/api/fti/save-pdf-to-drive/route.ts', {
    'next/server': { ...require('next/server'), after: () => {} },
    '@/lib/auth/session': { getSession: async () => ({ userId: 'owner', userRoleId: 2 }) },
    '@/lib/ftiSheets': { getFTIRequestFull: async () => ({ controlNo: 'R1', userId: 'owner', revision: 'current' }) },
    '@/lib/userApproverSheets': { getUserApprovers: async () => [] },
    '@/lib/ftiWriteLock': { withFTIWriteLock: async work => work(), FTIWriteConflict: class extends Error {} },
    '@/lib/ftiPdfJobs': { queueFTIPdf: async () => queued++, processFTIPdfJobs: async () => ({}) },
  });
  assert.equal((await pdfRoute.POST({ json: async () => { throw new Error('Legacy multipart request'); } })).status, 409);
  assert.equal((await pdfRoute.POST({ json: async () => ({ controlNo: 'R1', expectedRevision: 'old' }) })).status, 409);
  assert.equal(queued, 0, 'Old clients cannot replace a current PDF');
  assert.equal((await pdfRoute.DELETE()).status, 405, 'Old clients cannot delete a new PDF during rollback');
  assert.equal((await pdfRoute.POST({ json: async () => ({ controlNo: 'R1', expectedRevision: 'current' }) })).status, 200);
  assert.equal(queued, 1);

  const revision = load('src/lib/ftiRevision.ts').ftiRevision;
  const full = { controlNo: 'R1', userId: 'owner', status: 'SENT', totalAmount: 100, details: [{ fuelPrice: 10, fuelSubTotal: 100 }] };
  assert.notEqual(revision(full), revision({ ...full, totalAmount: 200 }));
  assert.notEqual(revision(full), revision({ ...full, details: [{ fuelPrice: 20, fuelSubTotal: 100 }] }));
  assert.equal(revision(full), revision({ ...full, pdfStatus: 'PENDING', ftiFileLink: 'different' }), 'PDF completion alone does not invalidate review');
  console.log('FTI fuel-route, PDF authorization, and revision tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('./test-fti-recalculation.cjs');
(async () => {
  assert.ok(fs.existsSync('src/lib/ftiWriteLock.ts'), 'Cross-instance lock must exist');
  let held = false, acquired = 0, released = 0;
  const api = { spreadsheets: { batchUpdate: async (request, options) => {
    const r = request.requestBody.requests[0];
    if (r.addSheet) {
      assert.equal(options.retry, false);
      if (held) throw Object.assign(new Error('A sheet with the name already exists'), { code: 400 });
      held = true; acquired++; return { data: { replies: [{ addSheet: { properties: { sheetId: acquired } } }] } };
    }
    held = false; released++; return { data: {} };
  } } };
  const mocks = { '@/lib/googleSheets': { getSheetsClient: async () => api, getDatabaseSpreadsheetId: async () => 'db' } };
  const a = load('src/lib/ftiWriteLock.ts', mocks), b = load('src/lib/ftiWriteLock.ts', mocks);
  await a.withFTIWriteLock(async () => {
    assert.equal(a.isFTIWriteLocked(), true);
    await a.withFTIWriteLock(async () => assert.equal(acquired, 1));
    await assert.rejects(b.withFTIWriteLock(async () => assert.fail('Concurrent writer ran')), /busy|progress/i);
  });
  assert.equal(released, 1);
  await assert.rejects(a.withFTIWriteLock(async () => { throw new Error('Write failed'); }), /Write failed/);
  assert.equal(released, 2); assert.equal(a.isFTIWriteLocked(), false);
  assert.equal(a.isUncertainFTIWrite({ code: 'ETIMEDOUT', config: { method: 'GET' } }), false, 'Read timeouts must remain retryable');
  assert.equal(a.isUncertainFTIWrite({ code: 'ETIMEDOUT', config: { method: 'POST' } }), true);
  await a.withFTIWriteLock(async () => {
    await assert.rejects(a.withFTIWriteLock(async () => { throw Object.assign(new Error('Nested response lost'), { code: 'ETIMEDOUT' }); }));
  });
  assert.equal(released, 2, 'A route catching a nested write error must not release an uncertain lock');
  held = false; // Simulate operator recovery before the next independent case.
  await assert.rejects(a.withFTIWriteLock(async () => { throw Object.assign(new Error('Response lost'), { code: 'ETIMEDOUT' }); }), /Response lost/);
  assert.equal(released, 2, 'Unknown write outcome must retain the lock rather than allow a later writer');
  assert.equal(held, true);
  console.log('FTI cross-instance lock tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

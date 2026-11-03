/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}
(async () => {
  const types = load('src/types/fti.ts');
  let status = 'SENT';
  let userId = 'owner';
  const writes = [];
  const route = load('src/app/api/fti/requests/[controlNo]/route.ts', {
    '@/types/fti': types,
    '@/lib/auth/session': { getSession: async () => ({ userId, userRoleId: 2 }) },
    '@/lib/userApproverSheets': { getUserApprovers: async () => [{ requesterUserId: 'owner', approverUserId: 'approver' }] },
    '@/lib/ftiSheets': {
      getFTIRequestFull: async () => ({ controlNo: 'CTRL-test', userId: 'owner', status }),
      updateFTIRequestStatus: async () => writes.push('status'),
      saveFullFTIRequest: async () => writes.push('details'),
      deleteFTIRequest: async () => writes.push('delete'),
      withdrawFTIRequest: async () => writes.push('withdraw'),
      updateFTIApproval: async () => writes.push('approval'),
      FTIApproverRequiredError: class extends Error {},
    },
  });
  const context = { params: Promise.resolve({ controlNo: 'CTRL-test' }) };
  for (status of ['SENT', 'SUBMITTED', 'APPROVED', 'REJECTED']) {
    assert.equal((await route.GET({}, context)).status, 200, 'Owner can view after submission');
    for (const body of [{ status: 'DRAFT' }, { status: 'DRAFT', details: [] }, { action: 'withdraw', force: true }]) {
      assert.equal((await route.PATCH({ json: async () => body }, context)).status, 403, `${status} must be read-only`);
    }
    assert.equal((await route.DELETE({}, context)).status, 403);
  }
  assert.deepEqual(writes, [], 'Locked requests must never reach a write');
  for (status of ['DRAFT', 'REQUESTED_FOR_CHANGE']) {
    assert.equal((await route.PATCH({ json: async () => ({ details: [] }) }, context)).status, 200);
    assert.equal((await route.DELETE({}, context)).status, 200);
  }
  status = 'SENT';
  userId = 'stranger';
  assert.equal((await route.GET({}, context)).status, 403);
  userId = 'approver';
  assert.equal((await route.PATCH({ json: async () => ({ action: 'approve' }) }, context)).status, 200);
  assert.equal(writes.at(-1), 'approval');
  console.log('FTI read-only regression tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : id.startsWith('@/') ? (require('./lib/sheets-mode-stubs.cjs').SHEETS_MODE_STUBS[id] ?? {}) : require(id), mod, mod.exports);
  return mod.exports;
}
(async () => {
  const writes = [];
  const fti = load('src/lib/ftiSheets.ts', {
    '@/lib/ftiWriteLock': { withFTIWriteLock: async work => work(), isFTIWriteLocked: () => true },
    '@/lib/googleSheets': {
      getDatabaseSpreadsheetId: async () => 'test',
      getSheetsClient: async () => ({ spreadsheets: { values: {
        get: async () => ({ data: { values: [['CTRL-test', 'requester', 'DRAFT']] } }),
        update: async data => writes.push(data),
      } } }),
    },
    '@/lib/userSheets': { getUsers: async () => [{ userId: 'requester', departmentId: 1, requiresApproval: true }] },
    '@/lib/userApproverSheets': { getApproverForRequester: async () => null },
  });
  const route = load('src/app/api/fti/requests/[controlNo]/route.ts', {
    'next/server': { ...require('next/server'), after: () => {} },
    '@/lib/ftiWriteLock': { withFTIWriteLock: async work => work(), FTIWriteConflict: class extends Error {} },
    '@/types/fti': load('src/types/fti.ts', {}),
    '@/lib/ftiSheets': { ...fti, getFTIRequestFull: async () => ({ userId: 'requester', status: 'DRAFT' }) },
    '@/lib/auth/session': { getSession: async () => ({ userId: 'requester', userRoleId: 1 }) },
  });
  const oldError = console.error;
  console.error = () => {};
  let response;
  try { response = await route.PATCH({ json: async () => ({ status: 'SENT' }) }, { params: Promise.resolve({ controlNo: 'CTRL-test' }) }); }
  finally { console.error = oldError; }
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /No approver is configured/);
  assert.equal(writes.length, 0, 'Missing approver must leave the request in draft');
  console.log('FTI submission regression test passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

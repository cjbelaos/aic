/* eslint-disable @typescript-eslint/no-require-imports -- Isolated service regression harness. */
// Final review, Critical 1: the DR service must never resend a save by itself. On the live Sheets
// backend a resend after a lost response (server already saved) creates a second DR.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const axios = require('axios');

const compiled = ts.transpileModule(fs.readFileSync('src/lib/services/delivery.service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const calls = { post: 0, put: 0 };
const lost = new axios.AxiosError('Network Error', 'ERR_NETWORK'); // no response: the server may have saved
const client = {
  isAxiosError: axios.isAxiosError,
  post: async () => { calls.post++; throw lost; },
  put: async () => { calls.put++; throw lost; },
};
const fixture = { exports: {} };
new Function('require', 'module', 'exports', compiled)((id) => {
  if (id === 'axios') return client;
  if (id === 'sonner') return { toast: { warning: () => {} } };
  throw new Error(`Unexpected dependency: ${id}`);
}, fixture, fixture.exports);
const service = fixture.exports.default;

(async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(service.createAndPopulateSheet({ status: 'created', items: [] }), (e) => e === lost);
    assert.equal(calls.post, 1, 'create was sent twice after a lost response');
    await assert.rejects(service.update(4100, { comments: 'x' }), (e) => e === lost);
    assert.equal(calls.put, 1, 'update was sent twice after a lost response');
  } finally {
    console.error = originalError;
  }
  console.log('Delivery service no-resend regression tests passed.');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });

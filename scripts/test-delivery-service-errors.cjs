/* eslint-disable @typescript-eslint/no-require-imports -- Isolated service regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const axios = require('axios');

const compiled = ts.transpileModule(fs.readFileSync('src/lib/services/delivery.service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const fixture = { exports: {} };
let failure;
const client = { isAxiosError: axios.isAxiosError, post: async () => { throw failure; }, put: async () => { throw failure; }, delete: async () => { throw failure; } };
new Function('require', 'module', 'exports', compiled)((id) => {
  if (id === 'axios') return client;
  if (id === 'sonner') return { toast: {} };
  throw new Error(`Unexpected dependency: ${id}`);
}, fixture, fixture.exports);

(async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const action of [() => fixture.exports.default.createAndPopulateSheet({}), () => fixture.exports.default.update(123, {}), () => fixture.exports.default.delete(123)]) {
      for (const message of ['Enter a TR Number, or switch the reference to a Sales Order.', "Delivery line 1 exceeds the selected Sales Order line's remaining quantity (0)."] ) {
        failure = new axios.AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { error: message } });
        await assert.rejects(action, (error) => error.message === message);
      }
      for (const data of [undefined, {}, { error: { message: 'invalid shape' } }, { error: '' }]) {
        failure = new axios.AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 500, data });
        await assert.rejects(action, (error) => error === failure);
      }
      failure = new Error('Network Error');
      await assert.rejects(action, (error) => error === failure);
    }
  } finally {
    console.error = originalError;
  }
  console.log('Delivery service error regression tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

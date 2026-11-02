/* eslint-disable @typescript-eslint/no-require-imports -- Isolated service regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const axios = require('axios');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/services/fti.service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const fixture = { exports: {} };
const client = axios.create();
let failure;
client.defaults.adapter = async () => { throw failure; };
new Function('require', 'module', 'exports', compiled)((id) => {
  if (id === 'axios') return { create: () => client, isAxiosError: axios.isAxiosError };
  throw new Error(`Unexpected dependency: ${id}`);
}, fixture, fixture.exports);
(async () => {
  for (const action of [() => fixture.exports.ftiService.updateRequest('CTRL-test', { status: 'SENT' }), () => fixture.exports.ftiService.createRequest()]) {
    const message = 'No approver is configured for this user. Contact your administrator before submitting.';
    failure = new axios.AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 500, data: { error: message } });
    await assert.rejects(action, (error) => error.message === message);
    for (const data of [undefined, {}, { error: {} }, { error: '' }]) {
      failure = new axios.AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 500, data });
      await assert.rejects(action, (error) => error === failure);
    }
    failure = new Error('Network Error');
    await assert.rejects(action, (error) => error === failure);
  }
  console.log('FTI service error regression tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

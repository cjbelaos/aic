/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}
module.exports = { load };
if (require.main === module) (async () => {
  assert.ok(fs.existsSync('src/lib/ftiRecalculation.ts'), 'Fuel recalculation must exist');
  const { planFTIRecalculation, philippineToday } = load('src/lib/ftiRecalculation.ts', {
    '@/lib/googleSheets': {}, '@/lib/ftiWriteLock': {},
  });
  assert.equal(philippineToday(new Date('2026-11-13T15:59:59Z')), '2026-11-13');
  assert.equal(philippineToday(new Date('2026-11-13T16:00:00Z')), '2026-11-14');
  const statuses = ['DRAFT', 'SENT', 'SUBMITTED', 'REQUESTED_FOR_CHANGE', 'REJECTED', 'APPROVED', 'UNKNOWN'];
  const snapshot = {
    settings: [['globalFuelPrice', 94.49]],
    requests: statuses.map((s, i) => ['R'+i, 'u', s, '', i === 1 ? 'https://drive.google.com/file/d/test/view' : '', 0]),
    details: statuses.flatMap((s, i) => [
      ['old'+i, 'R'+i, '2026-11-13', '', '', 120, 94.49, 944.9, 10],
      ['today'+i, 'R'+i, '2026-11-14', '', '', 120, 94.49, 944.9, 20],
      ['future'+i, 'R'+i, '2026-11-16', '', '', 152.1, 94.49, 1197.66, 30],
    ]),
    expenses: [['e', 'today1', 'meal', 125]], rates: [['u', 10]],
  };
  const original = structuredClone(snapshot);
  const result = planFTIRecalculation(snapshot, 79.2, '2026-11-14');
  assert.deepEqual(snapshot, original, 'Planning cannot mutate source data');
  assert.equal(result.affectedRequests, 5); assert.equal(result.affectedTrips, 10);
  assert.ok(!result.data.some(u => /G(2|5|8|11|14|17|20):/.test(u.range)), 'Past rows are untouched');
  assert.deepEqual(result.data.find(u => u.range === 'FTIDetails!G3:H3').values, [[79.2, 950.4]]);
  assert.deepEqual(result.data.find(u => u.range === 'FTIRequests!F3').values, [[3284.93]]);
  assert.ok(result.data.some(u => u.range === 'FTIRequests!L3:N3' && u.values[0][0] === 'PENDING'));
  assert.equal(result.pendingPdfs, 1);
  const fallback = structuredClone(snapshot); fallback.rates = [['u', -1]];
  assert.deepEqual(planFTIRecalculation(fallback, 79.2, '2026-11-14').data.find(u => u.range === 'FTIDetails!G3:H3').values, [[79.2, 792]]);
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => planFTIRecalculation(snapshot, invalid, '2026-11-14'));
  const badDate = structuredClone(snapshot); badDate.details[1][2] = '2026-02-30';
  assert.throws(() => planFTIRecalculation(badDate, 79.2, '2026-11-14'), /date/i);
  const zero = structuredClone(snapshot); zero.details[1][5] = 0;
  assert.equal(planFTIRecalculation(zero, 79.2, '2026-11-14').data.find(u => u.range === 'FTIDetails!G3:H3').values[0][1], 0);
  const noChange = structuredClone(snapshot); noChange.details.forEach(d => { if (d[2] >= '2026-11-14') { d[6] = 79.2; d[7] = Number((Number(d[5]) / 10 * 79.2).toFixed(2)); } });
  assert.equal(planFTIRecalculation(noChange, 79.2, '2026-11-14').affectedRequests, 0);
  console.log('FTI recalculation tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

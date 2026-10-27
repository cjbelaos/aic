/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript test harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}
async function main() {
  const rules = load('src/lib/liquidation-returns.ts');
  const approved = { liquidationId: 'liq', userId: 'owner', status: 'APPROVED', totalAmountRequested: 1000, totalAmount: 600 };
  assert.equal(rules.getLiquidationReturnAmount(approved), 400);
  assert.equal(rules.getLiquidationReturnAmount({ ...approved, totalAmount: 1000.01 }), 0);
  assert.equal(rules.getLiquidationReturnAmount({ ...approved, totalAmountRequested: 0.3, totalAmount: 0.1 }), 0.2);
  assert.equal(rules.getLiquidationReturnStatus(approved), 'NOT_RECORDED');
  assert.equal(rules.getLiquidationReturnStatus({ ...approved, returnDate: '2020-01-01' }), 'NOT_RECORDED');
  assert.equal(rules.getLiquidationReturnStatus({ ...approved, returnDate: '2020-01-01', returnEvidenceFileId: 'file' }), 'RETURNED');
  assert.equal(rules.getLiquidationReturnStatus({ ...approved, totalAmount: 1000 }), 'NOT_APPLICABLE');
  assert.equal(rules.getLiquidationReturnStatus({ ...approved, status: 'SUBMITTED' }), undefined);
  const now = new Date('2026-10-26T16:01:00Z');
  assert.equal(rules.manilaToday(now), '2026-10-27');
  assert.doesNotThrow(() => rules.validateReturnDate('2020-02-29', now));
  assert.doesNotThrow(() => rules.validateReturnDate('2026-10-27', now));
  for (const date of ['', '2026-10-28', '2026-02-29', '2026-02-30', '27/10/2026', '2026-10-27T00:00:00Z']) {
    assert.throws(() => rules.validateReturnDate(date, now));
  }
  assert.throws(() => rules.assertCanRecordReturn(approved, 'other'), /requestor/i);
  assert.throws(() => rules.assertCanRecordReturn({ ...approved, status: 'SAVED' }, 'owner'), /approved/i);
  assert.throws(() => rules.assertCanRecordReturn({ ...approved, totalAmount: 1000 }, 'owner'), /amount/i);
  assert.doesNotThrow(() => rules.assertCanRecordReturn(approved, 'owner'));
  console.log('Liquidation return rules passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

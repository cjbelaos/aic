import assert from 'node:assert/strict';
process.argv.push('--self-test');
const { planBackfill } = await import('./backfill-receipt-reference-dates.mjs');
const headers = ['ReceiptItemId','Date','SINumber','SIDate','DRNumber','DRDate','CRNumber','CRDate','BSNumber','BSDate','ORNumber','ORDate','RefNo','CheckNo','CVNo','OthersDate'];
const rows = [headers,
 ['one', 46000, 'SI', '', 'DR', 'existing', 'CR', '', 'BS', '', 'OR', '', '', 'CHECK', '', ''],
 ['two', '', 'SI'],
 ['three', 46001, '', 'keep'],
];
const plan = planBackfill(rows);
assert.equal(plan.changes.length, 5);
assert.equal(plan.skippedBlankDate, 1);
assert.equal(plan.changedRows, 1);
assert.ok(plan.changes.every(c => c.value === 46000));
assert.ok(!plan.changes.some(c => c.field === 'DRDate'));
assert.throws(() => planBackfill([['Date']]), /Missing or duplicate/);
for (const change of plan.changes) {
 const col = change.range.split('!')[1].match(/[A-Z]+/)[0];
 let index = 0;
 for (const char of col) index = index * 26 + char.charCodeAt(0) - 64;
 rows[1][index - 1] = change.value;
}
assert.equal(planBackfill(rows).changes.length, 0);
console.log('Backfill blank-only, reference mapping, missing-date, and idempotency checks passed.');

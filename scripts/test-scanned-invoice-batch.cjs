/* eslint-disable @typescript-eslint/no-require-imports -- Plain Node test of the batch scan rules. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', output)(require, fixture, fixture.exports);
  return fixture.exports;
}

const rules = load('src/lib/scannedInvoiceBatch.ts');

// Red-ink detection matches the scanner's red invoice number only.
assert.equal(rules.isRedInk(200, 50, 50), true);
assert.equal(rules.isRedInk(140, 50, 50), false);
assert.equal(rules.isRedInk(200, 130, 50), false);
assert.deepEqual([...rules.redInkMask(Uint8ClampedArray.from([200, 50, 50, 255, 20, 20, 20, 255]))], [0, 0, 0, 255, 255, 255, 255, 255]);

// The longest 3–6 digit run is the invoice number.
assert.equal(rules.pickInvoiceNumber('1599\n'), '1599');
assert.equal(rules.pickInvoiceNumber('N 12 1816 x'), '1816');
assert.equal(rules.pickInvoiceNumber(''), null);
assert.equal(rules.pickInvoiceNumber('12'), null);

// Row status precedence: skipped → unread → duplicate → not_found → inactive → replaces_scan → match.
const info = (over = {}) => ({ invoiceNo: '1817', companyName: 'X', total: 1, status: 'created', hasScan: false, ...over });
assert.equal(rules.rowStatus('', false, undefined, false), 'unread');
assert.equal(rules.rowStatus('9999', false, undefined, false), 'not_found');
assert.equal(rules.rowStatus('11599', false, undefined, false), 'not_found');
assert.equal(rules.rowStatus('1817', false, info(), false), 'match');
assert.equal(rules.rowStatus('1817', false, info({ hasScan: true }), false), 'replaces_scan');
assert.equal(rules.rowStatus('1817', false, info({ status: 'void' }), false), 'inactive');
assert.equal(rules.rowStatus('1817', false, info({ status: 'cancelled', hasScan: true }), false), 'inactive');
assert.equal(rules.rowStatus('1817', false, info(), true), 'duplicate');
assert.equal(rules.rowStatus('', true, undefined, true), 'skipped');

for (const status of ['match', 'replaces_scan', 'inactive', 'skipped']) assert.equal(rules.blocksSave(status), false, status);
for (const status of ['not_found', 'unread', 'duplicate']) assert.equal(rules.blocksSave(status), true, status);

assert.deepEqual([...rules.duplicateNumbers(['1816', '1815', '1816', ''])], ['1816']);
assert.deepEqual([...rules.duplicateNumbers(['', ''])], []);

// Unsure reads (low OCR confidence, or a digit count unlike the batch) get an amber "check_number", which never blocks saving.
assert.equal(rules.typicalDigitLength(['1599', '1816', null, '599', '1750']), 4);
assert.equal(rules.typicalDigitLength([null, null]), null);
assert.equal(rules.isUncertainRead('1816', 91, 4), false);
assert.equal(rules.isUncertainRead('1816', 79, 4), true);
assert.equal(rules.isUncertainRead('599', 96, 4), true);
assert.equal(rules.isUncertainRead('1816', 91, null), false);
assert.equal(rules.isUncertainRead(null, 0, 4), false);
assert.equal(rules.rowStatus('1817', false, info(), false, true), 'check_number');
assert.equal(rules.rowStatus('1817', false, info({ hasScan: true }), false, true), 'check_number');
assert.equal(rules.rowStatus('9999', false, undefined, false, true), 'not_found');
assert.equal(rules.rowStatus('1817', false, info(), true, true), 'duplicate');
assert.equal(rules.blocksSave('check_number'), false);

// The browser uses pdfjs's legacy build (polyfills Map#getOrInsertComputed, Math.sumPrecise, Uint8Array#toHex for older browsers).
const pdfModule = fs.readFileSync('src/lib/scannedInvoiceBatchPdf.ts', 'utf8');
assert.match(pdfModule, /import\("pdfjs-dist\/legacy\/build\/pdf\.mjs"\)/);
assert.match(pdfModule, /"pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs"/);

// Service Invoice scans move to the new folder; Sales Invoice scans stay put.
assert.match(fs.readFileSync('src/app/api/service-invoices/upload-scanned/route.ts', 'utf8'), /1bUpm-7ExZzgBvcmqBNd24iw6n3q_R1IM/);
assert.match(fs.readFileSync('src/app/api/sales-invoices/upload-scanned/route.ts', 'utf8'), /166LGOl4qTL4Ukabnrk335OT0ccLQnCq_/);

console.log('scanned invoice batch rules: ok');

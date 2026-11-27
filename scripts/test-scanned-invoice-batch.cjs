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
const info = (over = {}) => ({ invoiceNo: '1817', companyName: 'X', detail: '', status: 'created', hasScan: false, ...over });
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

// Drafts are flagged like cancelled/void: a signed copy of an unprinted draft is almost certainly a misread.
assert.equal(rules.rowStatus('1817', false, info({ status: 'draft' }), false), 'inactive');
assert.equal(rules.blocksSave('inactive'), false);

// An invoice that already has a scan is held back unless Replace is ticked.
assert.equal(rules.isHeldBack(info({ hasScan: true }), false), true);
assert.equal(rules.isHeldBack(info({ hasScan: true }), true), false);
assert.equal(rules.isHeldBack(info(), false), false);
assert.equal(rules.isHeldBack(undefined, false), false);

// DR numbers are printed in black: dark pixels kept, light and red dropped.
assert.deepEqual([...rules.darkInkMask(Uint8ClampedArray.from([30, 30, 30, 255, 240, 240, 240, 255, 200, 50, 50, 255]))], [0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
assert.deepEqual([...rules.inkMask(rules.SERVICE_INVOICE_PROFILE, Uint8ClampedArray.from([200, 50, 50, 255]))], [0, 0, 0, 255]);
assert.deepEqual([...rules.inkMask(rules.DELIVERY_RECEIPT_PROFILE, Uint8ClampedArray.from([200, 50, 50, 255]))], [255, 255, 255, 255]);
assert.equal(rules.DELIVERY_RECEIPT_PROFILE.filePrefix, 'DR');

// Each profile has its own "Not active" statuses.
const drInactive = rules.DELIVERY_RECEIPT_PROFILE.inactiveStatuses;
assert.equal(rules.rowStatus('4030', false, info({ status: 'cancelled' }), false, false, drInactive), 'inactive');
assert.equal(rules.rowStatus('4030', false, info({ status: 'pending_approval' }), false, false, drInactive), 'inactive');
assert.equal(rules.rowStatus('4030', false, info({ status: 'printed' }), false, false, drInactive), 'match');
assert.equal(rules.rowStatus('4030', false, info({ status: 'void' }), false, false, drInactive), 'match');

// A saved scan returns its Document Tracker entry.
const scanReturn = load('src/lib/documentScanReturn.ts');
assert.equal(scanReturn.scanReturnPlan(undefined), 'create');
assert.equal(scanReturn.scanReturnPlan('handed_over'), 'return_both');
assert.equal(scanReturn.scanReturnPlan('received_by_after_sales'), 'verify_only');
assert.equal(scanReturn.scanReturnPlan('returned'), 'skip');
assert.equal(scanReturn.scanReturnPlan('unassigned'), 'skip');
assert.equal(scanReturn.pickScanReturnEntry([{ id: 'a', status: 'unassigned' }, { id: 'b', status: 'handed_over' }]).id, 'b');
assert.equal(scanReturn.pickScanReturnEntry([{ id: 'a', status: 'returned' }]).id, 'a');
assert.equal(scanReturn.pickScanReturnEntry([]), undefined);

// A signed DR scan completes only an issued DR.
for (const status of ['created', 'printed', ' Printed ']) assert.equal(scanReturn.drCompletesOnScan(status), true, status);
for (const status of ['draft', 'pending_approval', 'rejected', 'cancelled', 'deleted', 'completed', '', undefined]) assert.equal(scanReturn.drCompletesOnScan(status), false, String(status));

async function pageExtractorTests() {
  const { PDFDocument } = require('pdf-lib');
  const extractor = load('src/lib/scannedInvoicePageExtractor.ts');
  const doc = await PDFDocument.create();
  doc.addPage([100, 200]);
  doc.addPage([300, 400]);
  const bytes = await doc.save();

  // Loads the batch once, then copies single original pages by index.
  const extract = await extractor.createPageExtractor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const file = await extract(1, '1599');
  assert.equal(file.name, 'SI 1599.pdf');
  assert.equal(file.type, 'application/pdf');
  const single = await PDFDocument.load(await file.arrayBuffer());
  assert.equal(single.getPageCount(), 1);
  assert.deepEqual(single.getPage(0).getSize(), { width: 300, height: 400 });

  // A PDF pdf-lib cannot read fails when the batch is opened, not after the user has checked every row.
  const dr = await extractor.createPageExtractor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'DR');
  assert.equal((await dr(0, '4030')).name, 'DR 4030.pdf');

  await assert.rejects(() => extractor.createPageExtractor(new TextEncoder().encode('not a pdf').buffer));
}

pageExtractorTests().then(() => console.log('scanned invoice batch rules: ok'), (error) => { console.error(error); process.exit(1); });

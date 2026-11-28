/* eslint-disable @typescript-eslint/no-require-imports -- Plain Node test of scanned copy file names. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', output)(require, fixture, fixture.exports);
  return fixture.exports;
}

const n = load('src/lib/scannedCopyFileName.ts');

// Dates: stored ISO or M/D/YYYY become MM-DD-YYYY.
assert.deepEqual(n.scanDateParts('2026-11-27'), { mm: '11', dd: '27', yyyy: '2026' });
assert.deepEqual(n.scanDateParts('2026-11-27T00:00:00.000Z'), { mm: '11', dd: '27', yyyy: '2026' });
assert.deepEqual(n.scanDateParts('11/5/2026'), { mm: '11', dd: '05', yyyy: '2026' });
assert.equal(n.scanDateParts(''), null);
assert.equal(n.scanDateParts('soon'), null);
assert.equal(n.scanDateParts('2026-13-01'), null);

// Customer names stay as written; only file-breaking characters go.
assert.equal(n.sanitizeFileNamePart('ZODIAC HEALTH VENTURES INC. (HCCH)'), 'ZODIAC HEALTH VENTURES INC. (HCCH)');
assert.equal(n.sanitizeFileNamePart('GOLDEN EAST RESOURCE TRADING, OPC'), 'GOLDEN EAST RESOURCE TRADING, OPC');
assert.equal(n.sanitizeFileNamePart('A/B: C*?'), 'A B C');
assert.equal(n.sanitizeFileNamePart('  two\tspaces  '), 'two spaces');

// Extensions come from the file name, then the mime type.
assert.equal(n.scanExtension('DR 4110.pdf'), '.pdf');
assert.equal(n.scanExtension('photo.JPEG'), '.jpg');
assert.equal(n.scanExtension('', 'image/png'), '.png');
assert.equal(n.scanExtension('noext', 'image/webp'), '.webp');
assert.equal(n.scanExtension('noext'), '.pdf');

// Full names.
assert.deepEqual(
  n.scannedCopyFileName({ prefix: 'DR', date: '2026-11-27', number: '4110', customer: 'ALABANG MEDICAL CENTER', extension: '.pdf' }),
  { name: 'DR-11-27-2026-4110-ALABANG MEDICAL CENTER.pdf', usedToday: false },
);
assert.equal(
  n.scannedCopyFileName({ prefix: 'SR', date: '11/5/2026', number: '1816', customer: 'A/B TRADING', extension: '.jpg' }).name,
  'SR-11-05-2026-1816-A B TRADING.jpg',
);
assert.deepEqual(
  n.scannedCopyFileName({ prefix: 'SI', date: '', number: '77', customer: 'COMP-131', extension: '.pdf', today: '2026-11-28' }),
  { name: 'SI-11-28-2026-77-COMP-131.pdf', usedToday: true },
);

// Replaced scans keep their name with a dated suffix before the extension.
assert.equal(n.replacedFileName('DR-11-27-2026-4110-X.pdf', '2026-11-28'), 'DR-11-27-2026-4110-X (replaced 2026-11-28).pdf');
assert.equal(n.replacedFileName('legacy', '2026-11-28'), 'legacy (replaced 2026-11-28)');
assert.equal(n.isReplacedFileName('X (replaced 2026-11-28).pdf'), true);
assert.equal(n.isReplacedFileName('X.pdf'), false);

// Drive links.
assert.equal(n.driveFileIdFromLink('https://drive.google.com/file/d/abc_DEF-123/view'), 'abc_DEF-123');
assert.equal(n.driveFileIdFromLink('https://drive.google.com/open?id=xyz789'), 'xyz789');
assert.equal(n.driveFileIdFromLink('https://example.com/file.pdf'), null);
assert.equal(n.driveFileIdFromLink(''), null);

// Manila is UTC+8.
assert.equal(n.manilaIsoDate(new Date('2026-11-27T17:00:00Z')), '2026-11-28');
assert.equal(n.manilaIsoDate(new Date('2026-11-27T15:59:00Z')), '2026-11-27');

console.log('scanned copy file name tests passed');

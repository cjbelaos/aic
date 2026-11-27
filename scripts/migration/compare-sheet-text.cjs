// Diagnostic: for every mapped tab, compares the PostgreSQL range read (src/lib/db/sheetRows.ts) with the
// snapshot's formatted text, cell by cell, and prints per-column difference counts with masked examples.
// Known, harmless classes: coordinate precision, seconds-only ISO stamps (+.000Z), jsonb key order and
// spacing, literal "NULL" FTI cells, the rekeyed contact, MOA slash dates.
//   node --env-file=.env.local scripts/migration/compare-sheet-text.cjs
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs'), path = require('path'), ts = require('typescript');
process.env.DATABASE_URL = process.env.STAGING_APP_DATABASE_URL;
const cache = new Map();
function load(file) { const full = path.resolve(file); if (cache.has(full)) return cache.get(full).exports; const mod = { exports: {} }; cache.set(full, mod);
  const out = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', out)((id) => id.startsWith('@/') ? load(path.join('src', id.slice(2)) + '.ts') : require(id), mod, mod.exports); return mod.exports; }
const { sheetRowsForRange } = load('src/lib/db/sheetRows.ts');
const { SHEET_COLUMNS } = load('src/lib/db/sheetColumns.generated.ts');
const snap = JSON.parse(fs.readFileSync('tmp/migration/snapshot-staging-1/database.json', 'utf8')).tabs;
const report = JSON.parse(fs.readFileSync('tmp/migration/snapshot-staging-1/import-report.json', 'utf8'));
const letter = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const mask = (v) => v.replace(/[0-9]/g, '9').replace(/[A-Za-z]+/g, (w) => /^(T|Z|TRUE|FALSE)$/.test(w) ? w : 'a').slice(0, 30);
(async () => {
  for (const [tab, spec] of Object.entries(SHEET_COLUMNS)) {
    const width = spec.headers.length; if (!width) continue;
    const table = spec.table.slice(4);
    const skip = new Set([...(report.rejected[table] || []), ...(report.excluded[table] || [])].map((x) => x.source_row));
    const src = snap[tab].formatted.map((r, i) => ({ r, row: i + 1 })).slice(1).filter(({ r, row }) => !skip.has(row) && r.some((v) => String(v ?? '').trim() !== '')).map(({ r }) => r);
    const db = await sheetRowsForRange(`${tab}!A2:${letter(width - 1)}`);
    if (src.length !== db.length) { console.log(`${tab}: ROWCOUNT sheet ${src.length} db ${db.length}`); continue; }
    const diffs = {};
    src.forEach((r, i) => { for (let c = 0; c < width; c++) { const a = String(r[c] ?? ''), b = String(db[i][c] ?? ''); if (a !== b) { const k = spec.headers[c] || `#${c}`; (diffs[k] ||= { n: 0, ex: `${mask(a)} | ${mask(b)}` }).n++; } } });
    const keys = Object.keys(diffs);
    if (keys.length) console.log(`${tab} (${src.length}): ` + keys.map((k) => `${k}×${diffs[k].n} [${diffs[k].ex}]`).join('; '));
  }
  await globalThis.__aicPgPool?.end();
})().catch((e) => { console.error(e.message); process.exit(1); });

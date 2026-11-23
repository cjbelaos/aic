/* eslint-disable @typescript-eslint/no-require-imports -- one-time CommonJS script. */
/* Read-only by default. --apply marks tracker invoice 1811 (spoiled paper, never in the app) as CANCELLED.
   Run: node --env-file=.env.local scripts/seed-tracker-spoiled-1811.cjs [--apply] */
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/googleSheets.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, mod, mod.exports);

const SPREADSHEET_ID = process.env.SERVICE_INVOICE_TRACKER_SPREADSHEET_ID || '1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A';
const SHEET_ID = Number(process.env.SERVICE_INVOICE_TRACKER_SHEET_ID || 449964054);
const INVOICE = '1811';
const REMARK = 'Spoiled – wrong document printed on this form.';
const CHECKED = { A: 0, B: 1, C: 2, E: 4, H: 7, J: 9, V: 21 };

async function main() {
  const sheets = await mod.exports.getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties(sheetId,title)' });
  const tab = meta.data.sheets.find(sheet => sheet.properties.sheetId === SHEET_ID);
  if (!tab) throw new Error('Service Invoice tracker tab was not found.');
  const title = `'${tab.properties.title.replace(/'/g, "''")}'`;
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${title}!A1:V`, valueRenderOption: 'FORMULA' })).data.values || [];
  if (rows[0]?.[3] !== 'Invoice No.' || rows[0]?.[21] !== 'Remarks') throw new Error('Tracker headers changed; stopped.');
  const matches = rows.map((row, i) => ({ row, number: i + 1 })).filter(({ row, number }) => number > 1 && String(row[3] ?? '').trim().replace(/^0+(?=\d)/, '') === INVOICE);
  if (matches.length !== 1) throw new Error(`Expected exactly one tracker row for ${INVOICE}, found ${matches.length}.`);
  const { row, number } = matches[0];
  const filled = Object.entries(CHECKED).filter(([, i]) => row[i] !== undefined && row[i] !== '').map(([col]) => col);
  if (filled.length) throw new Error(`Row ${number} for ${INVOICE} is already filled (${filled.join(', ')}); nothing written.`);
  const data = [{ range: `${title}!B${number}`, values: [['CANCELLED']] }, { range: `${title}!V${number}`, values: [[REMARK]] }];
  if (!process.argv.includes('--apply')) {
    console.log(`Dry run. Row ${number} (invoice ${INVOICE}) would get:`);
    for (const entry of data) console.log(`  ${entry.range} = ${JSON.stringify(entry.values[0][0])}`);
    console.log('Re-run with --apply to write.');
    return;
  }
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data } });
  console.log(`${INVOICE} marked spoiled at row ${number}.`);
}
main().catch(error => { console.error(error.message); process.exit(1); });

// Preview by default; --apply writes only the previously reviewed blank cells.
import { google } from "googleapis";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

export function planBackfill(values) {
  const headers = (values[0] || []).map(v => String(v).trim().toLowerCase());
  const column = (name) => {
    const indexes = headers.flatMap((h, i) => h === name.toLowerCase() ? [i] : []);
    if (indexes.length !== 1) throw new Error(`Missing or duplicate header: ${name}`);
    return indexes[0];
  };
  const dateCol = column('Date');
  const idCol = column('ReceiptItemId');
  const pairs = [
    [['SINumber'], 'SIDate'], [['DRNumber'], 'DRDate'],
    [['CRNumber'], 'CRDate'], [['BSNumber'], 'BSDate'],
    [['ORNumber'], 'ORDate'], [['RefNo', 'CheckNo', 'CVNo'], 'OthersDate'],
  ].map(([refs, date]) => ({ refs: refs.map(column), date, index: column(date) }));
  const letter = index => {
    let result = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
    return result;
  };
  const present = value => String(value ?? '').trim() !== '';
  const changes = [];
  let skippedBlankDate = 0;
  for (const [i, row] of values.slice(1).entries()) {
    if (!present(row[idCol])) continue;
    if (!present(row[dateCol])) { skippedBlankDate++; continue; }
    for (const pair of pairs) {
      if (pair.refs.some(index => present(row[index])) && !present(row[pair.index])) {
        changes.push({ range: `ReceiptItems!${letter(pair.index)}${i + 2}`, receiptItemId: row[idCol], field: pair.date, value: row[dateCol] });
      }
    }
  }
  return { scannedRows: values.length - 1, skippedBlankDate, changedRows: new Set(changes.map(c => c.range.match(/\d+$/)[0])).size, changes };
}

async function createSheetsClient() {
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8") : "");
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "aic-service-account@aic-nextjs-sheets-db-501208.iam.gserviceaccount.com";
  const scopes = [process.argv.includes('--apply')
    ? "https://www.googleapis.com/auth/spreadsheets"
    : "https://www.googleapis.com/auth/spreadsheets.readonly"];
  let jwt;
  if (saKey) {
    const trimmed = saKey.trim();
    if (trimmed.startsWith("-----BEGIN")) jwt = new google.auth.JWT({ email: saEmail, key: trimmed.replace(/\\n/g, "\n"), scopes });
    else {
      const parsed = JSON.parse(trimmed);
      jwt = new google.auth.JWT({ email: parsed.client_email || saEmail, key: parsed.private_key.replace(/\\n/g, "\n"), scopes });
    }
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    jwt = new google.auth.JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), scopes });
  }
  if (!jwt) throw new Error("No Google credentials found (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_PRIVATE_KEY).");
  return google.sheets({ version: "v4", auth: jwt });
}


if (!process.argv.includes('--self-test')) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
    if (!spreadsheetId) throw new Error('Missing database spreadsheet ID');
    const sheets = await createSheetsClient();
    const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ReceiptItems!A1:AF', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
    const plan = planBackfill(result.data.values || []);
    mkdirSync('tmp', { recursive: true });
    if (process.argv.includes('--apply')) {
      const approved = JSON.parse(readFileSync('tmp/receipt-reference-date-backfill.json', 'utf8'));
      const current = new Map(plan.changes.map(change => [change.range, change]));
      for (const change of approved.changes) {
        if (JSON.stringify(current.get(change.range)) !== JSON.stringify(change)) {
          throw new Error(`Reviewed target changed: ${change.range}. Refresh the preview before applying.`);
        }
      }
      writeFileSync('tmp/receipt-reference-date-backfill-applied.json', JSON.stringify(approved, null, 2));
      if (approved.changes.length) {
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: {
          valueInputOption: 'RAW',
          data: approved.changes.map(change => ({ range: change.range, values: [[change.value]] })),
        } });
        const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
        const sheetId = metadata.data.sheets.find(sheet => sheet.properties.title === 'ReceiptItems').properties.sheetId;
        const numericDates = approved.changes.filter(change => typeof change.value === 'number');
        if (numericDates.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: {
          requests: numericDates.map(change => {
            const [, letters, row] = change.range.match(/!([A-Z]+)(\d+)$/);
            let column = 0;
            for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
            return { repeatCell: {
              range: { sheetId, startRowIndex: Number(row) - 1, endRowIndex: Number(row), startColumnIndex: column - 1, endColumnIndex: column },
              cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
              fields: 'userEnteredFormat.numberFormat',
            } };
          }),
        } });
        const verified = await sheets.spreadsheets.values.batchGet({ spreadsheetId,
          ranges: approved.changes.map(change => change.range), valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER',
        });
        approved.changes.forEach((change, index) => {
          if (verified.data.valueRanges[index].values?.[0]?.[0] !== change.value) throw new Error(`Verification failed: ${change.range}`);
        });
      }
      console.log(`Applied and verified ${approved.changes.length} reference date cells. Numeric dates formatted as yyyy-mm-dd.`);
      const remaining = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ReceiptItems!A1:AF', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
      console.log(`Remaining eligible blank date cells: ${planBackfill(remaining.data.values || []).changes.length}`);
    } else {
    writeFileSync('tmp/receipt-reference-date-backfill.json', JSON.stringify(plan, null, 2));
    const counts = {};
    for (const change of plan.changes) counts[change.field] = (counts[change.field] || 0) + 1;
    console.log(JSON.stringify({ scannedRows: plan.scannedRows, skippedBlankDate: plan.skippedBlankDate, changedRows: plan.changedRows, cells: plan.changes.length, counts, report: 'tmp/receipt-reference-date-backfill.json' }, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

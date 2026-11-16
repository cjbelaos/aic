/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('./test-fti-recalculation.cjs');
(async () => {
  assert.ok(fs.existsSync('src/lib/ftiPdfJobs.ts'), 'Durable PDF processing must exist');
  const row = ['R1', 'u', 'SENT', '', 'https://drive.google.com/file/d/existing-file/view', 792, '', '', '', '', '', 'PENDING', '', 0];
  let failUpload = true, uploads = 0, rendered = [], total = 792;
  const drive = { files: {
    update: async args => { assert.equal(args.fileId, 'existing-file'); uploads++; if (failUpload) throw new Error('Drive temporarily unavailable'); },
    create: async () => assert.fail('Existing PDF must be replaced in place'),
  } };
  const sheets = { spreadsheets: { values: {
    get: async () => ({ data: { values: [row] } }),
    batchUpdate: async ({ requestBody }) => { for (const u of requestBody.data) {
      if (u.range.startsWith('FTIRequests!L')) row.splice(11, 3, ...u.values[0]);
      if (u.range.startsWith('FTIRequests!E')) row[4] = u.values[0][0];
    } },
  } } };
  const api = load('src/lib/ftiPdfJobs.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'db', getDriveUploadClient: async () => drive },
    '@/lib/ftiWriteLock': { withFTIWriteLock: async work => work(), isUncertainFTIWrite: () => false },
    '@/lib/ftiRecalculation': { ensureFTIWorkflowSchema: async () => {} },
    '@/lib/ftiSheets': { getFTIRequestFull: async () => ({ controlNo: 'R1', status: row[2], totalAmount: total, ftiFileLink: row[4], details: [] }), invalidateFTICache: () => {} },
    '@/lib/miscellaneousSheets': { getAllMiscellaneous: async () => [] },
    '@/lib/ftiPdf': { renderFTIPdf: async full => { rendered.push(full.totalAmount); return Buffer.from('%PDF-fake'); } },
  });
  await api.processFTIPdfJobs(1);
  assert.equal(row[11], 'FAILED'); assert.equal(row[13], 1);
  assert.ok(Date.parse(row[12]) > Date.now());
  await api.processFTIPdfJobs(1); assert.equal(uploads, 1, 'Backoff must be respected');
  total = 900; row[11] = 'PENDING'; row[12] = ''; failUpload = false;
  await api.processFTIPdfJobs(1);
  assert.deepEqual(rendered, [792, 900], 'Retry renders latest persisted state');
  assert.equal(row[11], ''); assert.equal(row[4], 'https://drive.google.com/file/d/existing-file/view');
  await api.processFTIPdfJobs(1); assert.equal(uploads, 2, 'Completed job must not repeat');
  row[2] = 'APPROVED'; row[11] = 'PENDING';
  await api.processFTIPdfJobs(1); assert.equal(row[11], '', 'Approval PDF may finish after approval');
  console.log('FTI PDF job tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

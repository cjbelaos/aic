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
  const approved = { liquidationId: 'liq', controlNo: '', userId: 'owner', status: 'APPROVED', totalAmountRequested: 1000, totalAmount: 600 };
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
  const access = load('src/lib/liquidation-return-access.ts', {
    '@/lib/auth/session': { isAdminUser: s => s.userRoleId === 1 },
    '@/lib/positionSheets': { getPositions: async () => [{ positionId: 5, positionTitle: 'Chief Financial Officer' }] },
    '@/lib/userApproverSheets': { getUserApprovers: async () => [{ requesterUserId: 'owner', approverUserId: 'mapped' }] },
    '@/lib/liquidation-returns': rules,
  });
  for (const [userId, userRoleId, positionId, allowed] of [
    ['owner', 2, 0, true], ['assigned', 2, 0, true], ['mapped', 2, 0, true],
    ['cfo', 2, 5, true], ['admin', 1, 0, true], ['unrelated', 2, 0, false],
  ]) {
    const session = { userId, userRoleId, positionId, departmentId: 4 };
    const context = await access.getReturnAccess(session);
    const liq = { ...approved, approvedByUserId: 'assigned', returnDate: '2020-01-01', returnEvidenceFileId: 'secret' };
    assert.equal(access.canViewReturn(liq, context), allowed, userId);
    const result = access.withReturnAccess(liq, context);
    assert.equal(result.canRecordReturn, userId === 'owner');
    assert.equal(result.returnEvidenceFileId, allowed ? 'secret' : undefined);
    assert.equal(result.returnDate, allowed ? '2020-01-01' : undefined);
  }
  console.log('Return access and redaction passed.');

  const rows = [[], ['liq', '', 'owner', '600', 'APPROVED', 'assigned', '', '', '', '', '1000']];
  const writes = [];
  const headers = Array(20).fill('');
  let invalidated = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: 'Liquidations', sheetId: 9, gridProperties: { columnCount: 26 } } }] } }),
    batchUpdate: async req => writes.push(req),
    values: {
      get: async req => ({ data: { values: req.range === 'Liquidations' ? [headers, ...rows] : req.range.includes('1:') ? [headers.slice(15)] : rows } }),
      batchUpdate: async req => writes.push(req),
    },
  } };
  const persistence = load('src/lib/liquidationReturnSheets.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'db' },
    '@/lib/liquidationSheets': {
      invalidateLiquidationCache: () => invalidated++,
      getLiquidationByIdFresh: async () => ({ ...approved }),
    },
    '@/lib/liquidation-returns': rules,
    '@/lib/ftiSheets': { getAllFTIRequests: async () => [{ controlNo: 'FTI', totalAmount: 1250 }] },
  });
  const enriched = await persistence.enrichLiquidationAdvances([{ ...approved, controlNo: 'FTI', totalAmountRequested: undefined }]);
  assert.equal(enriched[0].totalAmountRequested, 1250);
  const mixed = await persistence.enrichLiquidationAdvances([approved, { ...approved, controlNo: 'MISSING', totalAmountRequested: undefined }]);
  assert.equal(mixed[0].totalAmountRequested, 1000);
  assert.equal(mixed[1].returnAmountUnavailable, true, 'Orphaned FTI must not break the list or pretend nothing is due');
  assert.equal(rules.getLiquidationReturnStatus(mixed[1]), undefined);
  assert.throws(() => rules.assertCanRecordReturn(mixed[1], 'owner'), /cash advance/i);
  await assert.rejects(() => persistence.saveLiquidationReturn('liq', 'other', '2020-01-01', { fileId: 'f', name: 'p.png' }), /requestor/i);
  await assert.rejects(() => persistence.saveLiquidationReturn('liq', 'owner', '2020-01-01'), /evidence/i);
  await persistence.saveLiquidationReturn('liq', 'owner', '2020-01-01', { fileId: 'file', name: '=photo.png' });
  const data = writes.flatMap(w => w.requestBody.data || []);
  const returnWrite = data.find(d => d.range === 'Liquidations!N3:T3');
  assert.ok(returnWrite, 'Blank rows must not shift the target row');
  assert.equal(returnWrite.values[0][2], '2020-01-01');
  assert.equal(returnWrite.values[0][3], 'file');
  assert.equal(returnWrite.values[0][4], '=photo.png');
  assert.equal(writes.at(-1).requestBody.valueInputOption, 'RAW');
  assert.equal(invalidated, 1);
  rows[1][15] = '2020-01-01'; rows[1][16] = 'file'; rows[1][17] = 'p.png';
  await persistence.saveLiquidationReturn('liq', 'owner', '2020-01-02');
  assert.equal(writes.at(-1).requestBody.data.at(-1).values[0][3], 'file', 'Date-only edit preserves evidence');
  rows[1][4] = 'SAVED';
  await assert.rejects(() => persistence.saveLiquidationReturn('liq', 'owner', '2020-01-01'), /approved/i);
  console.log('Return persistence, legacy amounts and row-gap checks passed.');
  let created;
  const evidence = load('src/lib/liquidation-return-evidence.ts', {
    '@/lib/googleSheets': { getDriveUploadClient: async () => ({ files: {
      create: async req => { created = req; return { data: { id: 'private-file' } }; },
    } }) },
  });
  const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex');
  assert.equal(evidence.validateReturnImage(png), 'image/png');
  assert.throws(() => evidence.validateReturnImage(Buffer.from('<svg/>')), /PNG|JPEG/);
  assert.throws(() => evidence.validateReturnImage(Buffer.alloc(10 * 1024 * 1024 + 1)), /10 MB/);
  const upload = await evidence.uploadReturnEvidence('liq', png, 'proof.png');
  assert.equal(upload.fileId, 'private-file');
  assert.equal(created.requestBody.parents, undefined, 'No inherited public receipt-folder permissions');
  assert.equal(created.requestBody.properties.purpose, 'liquidation-return');
  console.log('Private evidence upload and image validation passed.');
  const { NextRequest } = require('next/server');
  let session = { userId: 'owner', userRoleId: 2, positionId: 0 };
  let current = { ...approved };
  let saveCount = 0;
  let uploadCount = 0;
  let failSave = false;
  const drive = { files: {
    get: async req => req.alt === 'media' ? { data: png } : { data: { properties: { purpose: 'liquidation-return', liquidationId: 'liq' }, mimeType: 'image/png' } },
    delete: async () => { throw new Error('Must not delete return evidence'); },
  } };
  const auth = { requireAuthenticatedSession: async () => session || Response.json({}, { status: 401 }) };
  const route = load('src/app/api/liquidations/returns/route.ts', {
    'next/server': require('next/server'), '@/lib/auth/session': auth,
    '@/lib/googleSheets': { getDriveUploadClient: async () => drive },
    '@/lib/liquidation-returns': rules, '@/lib/liquidation-return-access': access,
    '@/lib/liquidation-return-evidence': { uploadReturnEvidence: async (...args) => { uploadCount++; evidence.validateReturnImage(args[1]); return { fileId: 'new', name: 'proof.png' }; } },
    '@/lib/liquidationReturnSheets': {
      getReturnLiquidation: async () => current,
      saveLiquidationReturn: async (id, userId, date, proof) => {
        saveCount++; if (failSave) throw new Error('Simulated write failure');
        return { ...current, returnDate: date, returnEvidenceFileId: proof?.fileId || current.returnEvidenceFileId };
      },
    },
  });
  const post = (date = '2020-01-01', file) => {
    const body = new FormData(); body.append('liquidationId', 'liq'); body.append('returnDate', date);
    if (file) body.append('file', file);
    return route.POST(new NextRequest('http://localhost/api/liquidations/returns', { method: 'POST', body }));
  };
  const get = () => route.GET(new NextRequest('http://localhost/api/liquidations/returns?liquidationId=liq&evidence=true'));
  session = null;
  assert.equal((await post()).status, 401);
  assert.equal((await get()).status, 401);
  session = { userId: 'stranger', userRoleId: 1 };
  assert.equal((await post()).status, 403, 'Even admins cannot edit another requestor return');
  session = { userId: 'owner', userRoleId: 2 };
  // Expected validation errors are tested without printing their server logs.
  const originalError = console.error; console.error = () => {};
  try {
    assert.equal((await post()).status, 400);
    assert.equal(saveCount, 0);
    assert.equal((await post('2999-01-01', new File([png], 'proof.png'))).status, 400);
    assert.equal(uploadCount, 0);
    assert.equal((await post('2020-01-01', new File(['bad'], 'proof.png'))).status, 400);
    assert.equal(saveCount, 0);
    current = { ...approved, status: 'SUBMITTED' };
    assert.equal((await post('2020-01-01', new File([png], 'proof.png'))).status, 400);
    current = { ...approved };
    assert.equal((await post('2020-01-01', new File([png], 'proof.png'))).status, 200);
    current = { ...approved, returnDate: '2020-01-01', returnEvidenceFileId: 'old' };
    const before = uploadCount;
    const edit = await post('2020-01-02');
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).liquidation.returnEvidenceFileId, 'old');
    assert.equal(uploadCount, before, 'Date-only edits do not upload');
    failSave = true;
    assert.equal((await post('2020-01-03', new File([png], 'replacement.png'))).status, 400);
    assert.equal(current.returnEvidenceFileId, 'old', 'Failed replacement leaves previous record intact');
  } finally { console.error = originalError; }
  session = { userId: 'stranger', userRoleId: 2 };
  assert.equal((await get()).status, 403);
  session = { userId: 'cfo', positionId: 5, userRoleId: 2 };
  const imageResponse = await get();
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('Cache-Control'), 'private, no-store');
  const proxy = load('src/app/api/images/drive/[fileId]/route.ts', {
    'next/server': require('next/server'), '@/lib/auth/session': auth,
    '@/lib/googleSheets': { getDriveUploadClient: async () => drive },
  });
  assert.equal((await proxy.GET(new NextRequest('http://localhost/api/images/drive/old'), { params: Promise.resolve({ fileId: 'old' }) })).status, 403);
  const receipts = load('src/lib/receiptUpload.ts', { '@/lib/googleSheets': { getDriveUploadClient: async () => drive } });
  await assert.rejects(() => receipts.deleteReceiptFile('old'), /cannot be deleted/);
  console.log('Return API permissions, evidence retention, validation and bypass protection passed.');

  const listing = load('src/app/api/liquidations/route.ts', {
    'next/server': require('next/server'), '@/lib/auth/session': auth,
    '@/lib/liquidationSheets': { getAllLiquidations: async () => [{ ...current, approvedByUserId: 'assigned' }, { ...approved, liquidationId: 'pending', status: 'SUBMITTED' }], getAllReceiptItems: async () => [] },
    '@/lib/liquidationReturnSheets': { enrichLiquidationAdvances: async records => records },
    '@/lib/liquidation-return-access': access,
    '@/lib/userSheets': { getUsers: async () => [] },
    '@/lib/userApproverSheets': {},
  });
  const list = async (query = '') => (await (await listing.GET(new NextRequest('http://localhost/api/liquidations' + query))).json()).liquidations;
  assert.equal((await list()).length, 1, 'CFO sees approved returns without approver mapping');
  session = { userId: 'assigned', userRoleId: 2, departmentId: 4 };
  assert.equal((await list('?bod=true')).length, 2, 'BOD approver retains approved record and submitted queue');
  session = { userId: 'unrelated-bod', userRoleId: 2, departmentId: 4 };
  const unrelated = await list('?bod=true');
  assert.equal(unrelated.length, 1);
  assert.equal(unrelated[0].canViewReturn, false);
  console.log('CFO and BOD list visibility passed.');

  rows[1][4] = 'APPROVED';
  const sheetLib = load('src/lib/liquidationSheets.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'db' },
    '@/lib/liquidation-validation': load('src/lib/liquidation-validation.ts'),
  });
  await assert.rejects(() => sheetLib.updateLiquidationStatus('liq', 'SUBMITTED', 'owner'), /approved/i);
  await assert.rejects(() => sheetLib.updateLiquidationApproval('liq', 'reject', 'assigned'), /submitted/i);
  await assert.rejects(() => sheetLib.updateLiquidationRequestedAmount('liq', 1500, 'owner'), /approval/i);
  console.log('Approved liquidation immutability passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

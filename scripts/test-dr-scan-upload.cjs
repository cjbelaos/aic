/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Drive, Sheets and authentication fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)((id) => (Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') ? {} : require(id)), fixture, fixture.exports);
  return fixture.exports;
}

const session = { userId: 'chris', fullName: 'Chris John Belaos' };

function route(receipt, calls, { completeFails = false } = {}) {
  return load('src/app/api/deliveries/upload-scanned/route.ts', {
    '@/lib/auth/session': { requireAuthenticatedSession: async () => session },
    '@/lib/googleSheets': {
      getDriveUploadClient: async () => ({
        files: { create: async (req) => { calls.uploadParents = req.requestBody.parents; return { data: { id: 'scan1' } }; } },
        permissions: { create: async () => {} },
      }),
      findOrCreateDriveFolder: async (_drive, name, parent) => { calls.folder = { name, parent }; return `year-${name}`; },
    },
    '@/lib/companySheets': { getCompanies: async () => [{ companyId: 'C1', companyName: 'Honorable Dungca' }] },
    '@/lib/documentHandoverSheets': {
      trackerWarningAfterScan: async (input) => { calls.tracker = input; calls.customer = await input.resolveCustomerName(); return undefined; },
    },
    '@/lib/deliverySheets': {
      findDeliveryReceiptForScan: async (no) => (no === receipt?.drNumber ? receipt : null),
      recordDeliveryReceiptScan: async (row, link, actor) => { calls.recorded = { row, link, actor }; },
      completeDeliveryReceiptFromScan: async (no, row, status, actor) => {
        if (completeFails) throw new Error('Sheets offline');
        calls.completed = { no, row, status, actor };
        return true;
      },
    },
  });
}

function request(drNumber) {
  const form = new FormData();
  form.append('drNumber', drNumber);
  form.append('file', new File(['PDF'], 'DR 4030.pdf', { type: 'application/pdf' }));
  return new Request('http://test', { method: 'POST', body: form });
}

async function main() {
  const receipt = { drNumber: 4030, rowNumber: 12, date: '2026-11-10', companyId: 'C1', status: 'printed' };

  // Saved into the year of the DR's delivery date, recorded, completed, and returned in the tracker.
  const calls = {};
  const res = await route(receipt, calls).POST(request('4030'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fileLink, 'https://drive.google.com/file/d/scan1/view');
  assert.deepEqual(calls.folder, { name: '2026', parent: '1sya8h4vz1kuvCtuhcvO7PCoB0jZ0vxlB' });
  assert.deepEqual(calls.uploadParents, ['year-2026']);
  assert.deepEqual(calls.recorded, { row: 12, link: body.fileLink, actor: 'chris' });
  assert.deepEqual(calls.completed, { no: 4030, row: 12, status: 'printed', actor: 'chris' });
  assert.equal(calls.tracker.documentType, 'delivery_receipt');
  assert.equal(calls.tracker.documentNumber, '4030');
  assert.equal(calls.tracker.actor, session);
  assert.equal(calls.customer, 'Honorable Dungca');

  // A failed status update keeps the scan and reports a warning.
  const failing = {};
  const warned = await (await route(receipt, failing, { completeFails: true }).POST(request('4030'))).json();
  assert.equal(warned.success, true);
  assert.match(warned.statusWarning, /not marked completed: Sheets offline/);
  assert.ok(failing.recorded);

  // Unknown DRs and bad numbers are rejected before anything is uploaded.
  const none = {};
  assert.equal((await route(receipt, none).POST(request('9999'))).status, 404);
  assert.equal((await route(receipt, none).POST(request('40a'))).status, 400);
  assert.equal(none.uploadParents, undefined);

  await trackerTests();
  console.log('dr scan upload: ok');
}

function trackerModule(rows, writes, { receiver = true, admin = true } = {}) {
  const sheets = { spreadsheets: { values: {
    get: async () => ({ data: { values: rows } }),
    append: async (req) => { writes.append = req.requestBody.values[0]; },
    batchUpdate: async (req) => { writes.batch = req.requestBody.data; },
  } } };
  return load('src/lib/documentHandoverSheets.ts', {
    '@/lib/googleSheets': { getSheetsClient: async () => sheets, getDatabaseSpreadsheetId: async () => 'fixture' },
    '@/lib/userSheets': { getUserById: async () => null },
    '@/lib/documentHandoverWorkflow': { canReceiveAndVerifyDocuments: () => false, isAfterSalesDocumentReceiver: () => receiver },
    '@/lib/auth/session': { isAdminUser: () => admin },
    '@/lib/documentScanReturn': load('src/lib/documentScanReturn.ts'),
  });
}

function entry(id, type, no, status) {
  return [id, type, no, 'Cust', 'tech', 'Tech', 'a', 'A', '2026-11-10', status];
}

async function trackerTests() {
  const input = { documentType: 'delivery_receipt', documentNumber: '4030', actor: session, resolveCustomerName: async () => 'Honorable Dungca' };

  // Handed over: received and verified stamped, status returned.
  let writes = {};
  assert.equal(await trackerModule([entry('h1', 'service_invoice', '4030', 'handed_over'), entry('h2', 'delivery_receipt', '4030', 'handed_over')], writes).returnDocumentFromScan(input), 'returned');
  assert.deepEqual(writes.batch.map((d) => d.range), ['DocumentHandover!J3', 'DocumentHandover!P3:R3', 'DocumentHandover!S3:U3']);
  assert.deepEqual(writes.batch[0].values, [['returned']]);
  assert.deepEqual(writes.batch[2].values[0].slice(0, 2), ['chris', 'Chris John Belaos']);

  // Received by After Sales: only the verification is stamped.
  writes = {};
  await trackerModule([entry('h2', 'delivery_receipt', '4030', 'received_by_after_sales')], writes).returnDocumentFromScan(input);
  assert.deepEqual(writes.batch.map((d) => d.range), ['DocumentHandover!J2', 'DocumentHandover!S2:U2']);

  // Returned or unassigned: untouched.
  writes = {};
  assert.equal(await trackerModule([entry('h2', 'delivery_receipt', '4030', 'returned')], writes).returnDocumentFromScan(input), 'already_returned');
  assert.equal(await trackerModule([entry('h2', 'delivery_receipt', '4030', 'unassigned')], writes).returnDocumentFromScan(input), 'unassigned');
  assert.deepEqual(writes, {});

  // No entry: a new, already returned one assigned to the uploader.
  writes = {};
  assert.equal(await trackerModule([], writes).returnDocumentFromScan(input), 'created');
  const row = writes.append;
  assert.deepEqual(row.slice(1, 6), ['delivery_receipt', '4030', 'Honorable Dungca', 'chris', 'Chris John Belaos']);
  assert.equal(row[9], 'returned');
  assert.equal(row[13], 'Created from scanned copy upload');
  assert.deepEqual([row[15], row[18]], ['chris', 'chris']);

  // Someone who can't receive and verify: nothing written, scan keeps a warning.
  writes = {};
  const limited = trackerModule([entry('h2', 'delivery_receipt', '4030', 'handed_over')], writes, { receiver: false });
  assert.equal(await limited.returnDocumentFromScan(input), 'not_permitted');
  assert.match(await limited.trackerWarningAfterScan(input), /not updated/);
  assert.deepEqual(writes, {});
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

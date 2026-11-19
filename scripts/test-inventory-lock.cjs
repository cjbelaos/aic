/* eslint-disable @typescript-eslint/no-require-imports */
// Inventory write lock: one stock-reducing write at a time across instances,
// with takeover of a lock left behind for more than 120 seconds.
const assert = require('node:assert/strict');
const { load } = require('./test-fti-recalculation.cjs');

(async () => {
  let held = null; // { sheetId, stamp }
  let acquired = 0, released = 0, nextId = 0;
  const now = { value: Date.parse('2026-11-20T08:00:00Z') };
  const api = {
    spreadsheets: {
      batchUpdate: async (request, options) => {
        const requests = request.requestBody.requests;
        const add = requests.find((r) => r.addSheet);
        if (add) {
          assert.equal(options && options.retry, false, 'Lock acquisition must not auto-retry');
          if (held) throw Object.assign(new Error('A sheet with the name "_INVENTORY_WRITE_LOCK" already exists'), { code: 400 });
          const cells = requests.find((r) => r.updateCells);
          assert.ok(cells, 'The timestamp must be written in the same atomic request');
          assert.equal(cells.updateCells.start.sheetId, add.addSheet.properties.sheetId);
          held = { sheetId: add.addSheet.properties.sheetId, stamp: cells.updateCells.rows[0].values[0].userEnteredValue.stringValue };
          acquired++; nextId++;
          return { data: { replies: [{ addSheet: { properties: { sheetId: held.sheetId } } }] } };
        }
        const del = requests.find((r) => r.deleteSheet);
        if (del) {
          if (!held || held.sheetId !== del.deleteSheet.sheetId) throw new Error('No grid with id');
          held = null; released++;
          return { data: {} };
        }
        throw new Error('unexpected request');
      },
      get: async () => ({ data: { sheets: held ? [{ properties: { title: '_INVENTORY_WRITE_LOCK', sheetId: held.sheetId } }] : [] } }),
      values: { get: async () => ({ data: { values: held ? [[held.stamp]] : [] } }) },
    },
  };
  const mocks = {
    '@/lib/googleSheets': { getSheetsClient: async () => api, getDatabaseSpreadsheetId: async () => 'db' },
  };
  const a = load('src/lib/inventory/lock.ts', mocks);
  const b = load('src/lib/inventory/lock.ts', mocks);
  a.__setClock(() => now.value);
  b.__setClock(() => now.value);

  // acquire, nest, conflict, release
  await a.withInventoryLock(async () => {
    assert.equal(a.isInventoryLocked(), true);
    await a.withInventoryLock(async () => assert.equal(acquired, 1, 'Nested calls reuse the held lock'));
    await assert.rejects(b.withInventoryLock(async () => assert.fail('Concurrent writer ran')), /in progress/i);
  });
  assert.equal(released, 1);
  assert.equal(a.isInventoryLocked(), false);

  // a failed write still releases
  await assert.rejects(a.withInventoryLock(async () => { throw new Error('Write failed'); }), /Write failed/);
  assert.equal(released, 2);

  // a write with an unknown outcome keeps the lock
  await assert.rejects(a.withInventoryLock(async () => { throw Object.assign(new Error('Response lost'), { code: 'ETIMEDOUT', config: { method: 'POST' } }); }), /Response lost/);
  assert.ok(held, 'Unknown write outcome must retain the lock');

  // a fresh lock is not taken over
  now.value += 60 * 1000;
  await assert.rejects(b.withInventoryLock(async () => assert.fail('Took over a fresh lock')), /in progress/i);

  // a lock older than 120 s is taken over
  now.value += 61 * 1000;
  let ran = false;
  await b.withInventoryLock(async () => { ran = true; });
  assert.equal(ran, true, 'A stale lock must be taken over');
  assert.equal(held, null);

  // conflict errors carry HTTP 409
  await a.withInventoryLock(async () => {
    const error = await b.withInventoryLock(async () => {}).catch((e) => e);
    assert.equal(error.status, 409);
  });

  console.log('Inventory write lock tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

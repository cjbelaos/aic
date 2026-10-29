/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createLoader } = require("./proforma-runtime.cjs");

function database() {
  const tabs = new Map([["Contracts", { id: 1, rows: [["ContractId"], ["CTR-1", "COMP-1", "", "Contract", "", "2026-01-01", "2099-01-01", "Active", 100, "Old note", "soft-link", "signed-link"], ["CTR-2", "COMP-2"]] }]]);
  let writes = 0;
  let failNextBatch = false;
  let pauseNotesRead;
  function range(value) {
    const [name, cells] = value.split("!");
    const match = /([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?/.exec(cells);
    const col = text => [...text].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    return { tab: tabs.get(name), start: Number(match[2]) - 1, end: match[4] ? Number(match[4]) : match[3] ? undefined : Number(match[2]), col: col(match[1]), lastCol: col(match[3] || match[1]) };
  }
  const client = { spreadsheets: {
    get: async () => ({ data: { sheets: [...tabs].map(([title, tab]) => ({ properties: { title, sheetId: tab.id } })) } }),
    values: {
      get: async ({ range: value }) => {
        const r = range(value);
        assert.ok(r.tab, `Missing sheet ${value}`);
        const values = r.tab.rows.slice(r.start, r.end).map(row => row.slice(r.col, r.lastCol + 1));
        if (value === "ContractNotes!A1:E" && pauseNotesRead) {
          const gate = pauseNotesRead; pauseNotesRead = undefined;
          gate.entered(); await gate.wait;
        }
        return { data: { values } };
      },
      update: async ({ range: value, requestBody }) => {
        writes++;
        const r = range(value);
        requestBody.values.forEach((row, i) => { const dest = r.tab.rows[r.start + i] ||= []; row.forEach((v, j) => dest[r.col + j] = v); });
      },
      append: async ({ range: value, requestBody }) => { writes++; tabs.get(value.split("!")[0]).rows.push(...requestBody.values); },
      clear: async ({ range: value }) => { writes++; const r = range(value); for (let i = r.start; i < r.end; i++) r.tab.rows[i] = []; },
    },
    batchUpdate: async ({ requestBody }) => {
      if (failNextBatch) { failNextBatch = false; throw new Error("Simulated storage failure"); }
      writes++;
      for (const request of requestBody.requests) {
        if (request.addSheet) { const p = request.addSheet.properties; tabs.set(p.title, { id: p.sheetId, rows: [] }); continue; }
        if (request.deleteDimension) { const r = request.deleteDimension.range; [...tabs.values()].find(tab => tab.id === r.sheetId).rows.splice(r.startIndex, r.endIndex - r.startIndex); continue; }
        const op = request.updateCells || request.appendCells;
        assert.ok(op, "Unexpected batch operation");
        const tab = [...tabs.values()].find(t => t.id === (op.sheetId ?? op.range?.sheetId));
        const rows = op.rows.map(row => row.values.map(cell => cell.userEnteredValue?.stringValue ?? cell.userEnteredValue?.numberValue ?? ""));
        if (request.appendCells) {
          const last = tab.rows.findLastIndex(row => row.some(value => value !== "" && value !== undefined));
          rows.forEach((row, i) => { tab.rows[last + i + 1] = row; });
        }
        else {
          assert.equal(op.range.endRowIndex - op.range.startRowIndex, rows.length, "Update range must not clear unrelated rows");
          assert.equal(op.range.endColumnIndex - op.range.startColumnIndex, rows[0].length, "Update range must not clear unrelated columns");
          rows.forEach((row, i) => { const dest = tab.rows[op.range.startRowIndex + i] ||= []; row.forEach((v, j) => dest[op.range.startColumnIndex + j] = v); });
        }
      }
    },
  } };
  return { tabs, client, writes: () => writes, failNextBatch: () => { failNextBatch = true; }, pauseNextNotesRead: () => {
    let entered, resume;
    const ready = new Promise(resolve => { entered = resolve; });
    const wait = new Promise(resolve => { resume = resolve; });
    pauseNotesRead = { entered, wait };
    return { ready, resume };
  } };
}

async function main() {
  const db = database();
  const load = createLoader({ "@/lib/googleSheets": { getSheetsClient: async () => db.client, getDatabaseSpreadsheetId: async () => "test" } });
  const repo = load("src/lib/contractNoteSheets.ts");
  for (const operation of ["update", "delete"]) {
    const raceDb = database();
    const raceRepo = createLoader({ "@/lib/googleSheets": { getSheetsClient: async () => raceDb.client, getDatabaseSpreadsheetId: async () => "test" } })("src/lib/contractNoteSheets.ts");
    await raceRepo.setupContractNotes(true);
    const oldTail = await raceRepo.addContractNote("CTR-1", "Old last note");
    const pause = raceDb.pauseNextNotesRead();
    const pending = operation === "update" ? raceRepo.updateContractNote("CTR-1", oldTail.id, "Stale update") : raceRepo.deleteContractNote("CTR-1", oldTail.id);
    await pause.ready;
    await raceRepo.deleteContractNote("CTR-1", oldTail.id);
    const newTail = await raceRepo.addContractNote("CTR-1", "New last note");
    pause.resume();
    await pending;
    assert.equal((await raceRepo.getContractNotes()).find(note => note.id === newTail.id)?.text, "New last note", `A stale ${operation} must not overwrite a different note in a reused tail row`);
  }
  const { contractReady } = load("src/lib/contractStatus.ts");
  for (const status of ["Active", "Expired", "Closed", "Inactive"]) {
    for (const paperworkStatus of ["Complete", "Pending", undefined]) {
      assert.equal(contractReady({ status, paperworkStatus, endDate: "2099-01-01" }, "2026-10-29"), status === "Active" && paperworkStatus === "Complete");
    }
  }
  assert.equal(contractReady({ status: "Active", paperworkStatus: "Complete", endDate: "2026-01-01" }, "2026-10-29"), false);
  const helpers = load("src/lib/contractNotes.ts");
  const sample = [{ id: "old", text: "Legacy" }, { id: "new", text: "New", createdAt: "2026-10-29T12:00:00.000Z" }];
  assert.equal(helpers.sortContractNotes(sample)[0].id, "new");
  assert.equal(sample[0].id, "old", "Sorting does not mutate state");
  assert.equal(helpers.formatNoteDate(), "Date unavailable");
  assert.match(helpers.exportContractNotes(sample), /Added.+New[\s\S]+Date unavailable: Legacy/);
  assert.deepEqual(await repo.getContractNotes(), []);
  const before = db.writes();
  assert.equal((await repo.setupContractNotes(false)).legacyCount, 1);
  assert.equal(db.writes(), before, "Dry run never writes");
  await repo.setupContractNotes(true);
  let notes = await repo.getContractNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, "Old note");
  assert.equal(notes[0].createdAt, undefined);
  assert.equal(db.tabs.get("Contracts").rows[1][9], "");
  assert.deepEqual(db.tabs.get("Contracts").rows[1].slice(10, 12), ["soft-link", "signed-link"], "Migration preserves document links");
  await repo.setupContractNotes(true);
  assert.equal((await repo.getContractNotes()).length, 1, "Migration retries do not duplicate notes");

  const added = await repo.addContractNote("CTR-1", "  Follow up  ");
  assert.equal(added.text, "Follow up");
  assert.ok(Number.isFinite(Date.parse(added.createdAt)));
  const edited = await repo.updateContractNote("CTR-1", added.id, "Updated follow up");
  assert.equal(edited.createdAt, added.createdAt);
  assert.ok(edited.updatedAt);
  const old = await repo.updateContractNote("CTR-1", notes[0].id, "Edited old note");
  assert.equal(old.createdAt, undefined, "Legacy added dates remain unknown after edits");
  await assert.rejects(repo.updateContractNote("CTR-2", added.id, "Wrong parent"), /not found/i);
  await assert.rejects(repo.addContractNote("missing", "Note"), /not found/i);
  for (const value of [" ", null, 4, "x".repeat(10001)]) await assert.rejects(repo.addContractNote("CTR-1", value), /note/i);
  const another = await repo.addContractNote("CTR-2", "Other contract note");
  await repo.deleteContractNote("CTR-1", added.id);
  assert.ok(!(await repo.getContractNotes()).some(note => note.id === added.id));
  assert.equal((await repo.updateContractNote("CTR-2", another.id, "Still here")).text, "Still here", "Deletion does not shift other notes");

  db.tabs.set("ContractItems", { id: 3, rows: [["ItemId"]] });
  const contracts = load("src/lib/contractSheets.ts");
  const hydrated = (await contracts.getContracts()).find(contract => contract.id === "CTR-1");
  assert.equal(hydrated.noteHistory[0].text, "Edited old note");
  assert.equal(hydrated.notes, "Edited old note");
  const created = await contracts.addContract({ companyId: "COMP-1", agreementType: "Contract", startDate: "2026-01-01", endDate: "2099-01-01", status: "Active", notes: "Initial note" });
  assert.equal(created.noteHistory[0].text, "Initial note");
  assert.ok(created.noteHistory[0].createdAt);
  assert.equal(db.tabs.get("Contracts").rows.at(-1)[9], "", "New notes never use legacy column J");
  const beforeEdit = db.writes();
  await assert.rejects(contracts.updateContractInSheets({ id: created.id, notes: "Overwrite" }), /individual/i);
  assert.equal(db.writes(), beforeEdit, "Obsolete writes cannot overwrite history");
  const snapshot = JSON.stringify([...db.tabs]);
  db.failNextBatch();
  await assert.rejects(repo.appendContractWithInitialNote(["CTR-failure", "COMP-1"], "Must save together"), /storage failure/);
  assert.equal(JSON.stringify([...db.tabs]), snapshot, "Initial note and parent save atomically");
  await contracts.deleteContractFromSheets(created.id);
  assert.ok(!(await repo.getContractNotes()).some(note => note.contractId === created.id), "Deleting a contract removes its notes");
  assert.ok((await repo.getContractNotes()).some(note => note.id === another.id), "Cascade preserves other notes");

  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const { ContractNoteHistory } = createLoader({ "@/lib/utils": load("src/lib/utils.ts") })("src/components/contract-note-history.tsx");
  const html = renderToStaticMarkup(React.createElement(ContractNoteHistory, { notes: [{ id: "legacy", text: "<script>unsafe</script>" }, { id: "dated", text: "Recent", createdAt: "2026-10-29T12:00:00.000Z", updatedAt: "2026-10-29T13:00:00.000Z" }], onEdit() {}, onDelete() {} }));
  assert.match(html, /Date unavailable/);
  assert.match(html, /Times shown in/);
  assert.match(html, /Updated <time/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.ok(html.indexOf("Recent") < html.indexOf("unsafe"), "Rendered history is newest first");
  assert.match(html, />Edit<\/button>/);
  assert.match(html, />Delete<\/button>/);

  const routes = ["src/app/api/contracts/[id]/notes/route.ts", "src/app/api/contracts/[id]/notes/[noteId]/route.ts"];
  let authenticated = true;
  const apiLoad = createLoader({ "@/lib/contractNoteSheets": repo, "@/lib/auth/session": { requireAuthenticatedSession: async () => authenticated ? {} : new Response(null, { status: 401 }) } });
  const collection = apiLoad(routes[0]), individual = apiLoad(routes[1]);
  const ctx = { params: Promise.resolve({ id: "CTR-1", noteId: notes[0].id }) };
  const request = body => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await collection.POST(request({ text: "New" }), ctx)).status, 201);
  assert.equal((await collection.POST(request({ text: " " }), ctx)).status, 400);
  assert.equal((await collection.POST(request(null), ctx)).status, 400);
  assert.equal((await individual.PUT(request({ text: "Edited" }), ctx)).status, 200);
  assert.equal((await individual.PUT(request({ text: "Edited" }), { params: Promise.resolve({ id: "CTR-2", noteId: notes[0].id }) })).status, 404);
  assert.equal((await individual.DELETE(request({}), ctx)).status, 204);
  authenticated = false;
  for (const [handler, req] of [[collection.POST, request({ text: "x" })], [individual.PUT, request({ text: "x" })], [individual.DELETE, request({})]]) assert.equal((await handler(req, ctx)).status, 401);
  console.log("PASS badges, dated history rendering, migration, atomic initial notes, CRUD, cascades, validation, ownership, and authenticated APIs");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

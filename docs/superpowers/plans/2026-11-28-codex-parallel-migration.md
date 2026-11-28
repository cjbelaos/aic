# Codex brief: move the remaining modules from Google Sheets to PostgreSQL

You are working in `C:\Users\chris\aic`, a Next.js 16 app (read `AGENTS.md` first: this Next.js has breaking changes; read `node_modules/next/dist/docs/` before touching app or route code). Another agent (Claude) is migrating other parts of the same app at the same time. Follow this brief exactly; where it is silent, follow the existing patterns it names and record your decision in your final report.

## Where things stand

- **Live production** still runs on Google Sheets. Nothing you do may change production behaviour: every PostgreSQL change sits behind `isPostgresBackend()` (true only when `DATA_BACKEND=postgres`, which is set on the **staging** Vercel project only).
- **All data is already in PostgreSQL** (Supabase project `aic`, schema `aic`, 76 tables imported from the sheets, reconciled). Your job is the **app code**: make each module read and write PostgreSQL when `isPostgresBackend()` is true, with the Sheets path left byte-for-byte unchanged.
- Already migrated (do not redo): users; companies/products/supplier products/categories/units/delivered-by **reads**; DR, sales orders, contract releases, document handover, inventory lock and stock reads, positions and warehouses **reads**, contracts/contract items/notes **reads**; DR/Service Invoice/Quotation register reads.
- Background reading, in order: `HANDOFF.md` (section "Plan §4 progress"), `docs/superpowers/plans/2026-11-27-supabase-migration.md`, `docs/superpowers/plans/2026-11-28-dr-writes-postgres.md` (the pattern you are copying).

## Branch and coordination

1. `git fetch origin && git switch -c migration/codex-modules origin/migration/supabase`. Work and commit only on this branch. Never push to `main` or `migration/supabase`; Chris merges.
2. Before each batch: `git fetch origin && git rebase origin/migration/supabase`, then re-run the tests (below).
3. **Do not edit these files** (Claude owns them; if you need a change there, stop and describe it in your report):
   `src/lib/db/*` (all), `src/lib/deliverySheets.ts`, `src/lib/transactionItemSheets.ts`, `src/lib/deliveries/*`, `src/lib/salesOrders/*`, `src/lib/documentHandover*.ts`, `src/lib/contractSheets.ts`, `src/lib/contractItemSheets.ts`, `src/lib/contractNoteSheets.ts`, `src/lib/contractReleaseSheets.ts`, `src/lib/inventory/lock.ts`, `src/lib/invoiceRepository.ts`, `src/lib/quotation*.ts`, `src/lib/proforma/*`, `src/lib/serviceInvoiceTracker/*`, `src/lib/salesOrders/trackerWriter.ts`, `src/app/api/deliveries/**`, `src/app/api/jobs/**`, `src/proxy.ts`, `src/lib/auth/*`, `scripts/lib/ts-harness.cjs`, `scripts/lib/sheets-mode-stubs.cjs`, `scripts/migration/*`, `supabase/migrations/*`, `package.json` dependency sections.
4. You may add `"test:*"` entries to `package.json` `scripts` (append only).

## Hard safety rules (stop and report instead of breaking any of these)

1. **Never touch live Google Sheets or Drive.** `.env.local` holds real Google credentials. Only run app code through the test harness `scripts/lib/ts-harness.cjs`, which refuses every Google call. Never run `next dev`, scripts or ad-hoc `node -e` that import app modules outside the harness. (An earlier test that skipped this wrote a row to the live sheet.)
2. **Staging database writes only inside a transaction you roll back.** Use the `inRolledBack` pattern from `scripts/test-dr-writes-postgres.cjs`. If a test needs a second harness (for different mocks), run the rollback and the queries through **that same harness's** `src/lib/db/postgres.ts` — a second harness has its own transaction context and its writes would otherwise commit (this happened once).
3. **No schema changes.** Do not create migrations or run DDL. If a module needs a constraint, column or cascade, stop and describe it.
4. **No deletes outside a rolled-back transaction**, and never against Google.
5. Never print or log row contents, passwords, tokens or connection strings. Tests print counts and ids only.
6. Do not run `import.mjs --replace`, `apply-migrations.mjs` or `create-app-role.mjs`.

## The pattern

**Reads.** Every Sheets read becomes a branch that returns the same Sheets-shaped `string[][]` from the database, so the module's existing row parser runs unchanged:

```ts
import { isPostgresBackend } from "@/lib/db/postgres";
import { sheetRowsForRange } from "@/lib/db/sheetRows";

const rows = isPostgresBackend()
  ? await sheetRowsForRange(RANGE)              // e.g. "Vehicles!A2:O"; ranges must start at row 2
  : (await (await getSheetsClient()).spreadsheets.values.get({ spreadsheetId: await getDatabaseSpreadsheetId(), range: RANGE })).data.values;
```

Never call `getSheetsClient()` or `getDatabaseSpreadsheetId()` on the PostgreSQL path (staging has no Google credentials). `sheetRowsByHeaders(tab, headers)` exists for modules that know their header list. Column formats, timestamps and orphaned-link originals are handled by `src/lib/db/sheetColumns.generated.ts`; do not edit it.

**Writes.** Each write function gets a PostgreSQL branch that runs in a transaction stamped with the acting user:

```ts
import { currentActor, inTransaction, isPostgresBackend, txQuery } from "@/lib/db/postgres";
import { upsertSheetRows } from "@/lib/db/sheetWrites";

if (isPostgresBackend()) {
  await inTransaction(currentActor() ?? actorUserId, async () => {
    await upsertSheetRows("Vehicles", VEHICLE_HEADERS, [rowValues]);   // insert or update by primary key
    // or explicit SQL: await txQuery("update aic.vehicles set status = $2 where vehicle_id = $1", [id, status]);
  });
  return result;   // same return value as the Sheets path
}
```

- Keep validation, ID generation rules and return values shared above the branch. Build the same row array the Sheets path builds and hand it to `upsertSheetRows` (it maps headers to columns and types; blank becomes null).
- `inTransaction` nests as a savepoint if a transaction is already open, so callers can compose. Never catch an error from `txQuery` inside a transaction and continue: wrap the tolerated step in its own `inTransaction(...)` instead.
- The actor is the signed-in user id (`session.userId`), or `system:<job>` for background jobs. Writes without an actor are rejected by the database.
- **Deletes**: where the sheet physically deleted a row, use `txQuery("delete from aic.<table> where <pk> = $1", [id])`. Foreign keys will refuse deletes of referenced records; turn PostgreSQL error code `23503` (`pgErrorCode(error)`) into a clear user message, as `src/lib/users/postgresUsers.ts` does.
- **Row-number ids** (`comp_<row>`, `cont_<row>`, `rowNumberFromStableId`, `findIndex(...) + 2`): on PostgreSQL resolve the record from the same ordered read your read branch returns (index = row − 2), then write by its business key. Never write by row position.
- **Sequential ids** (e.g. `nextStableId`, `CTRL-…`, `AIC-PO-YYYY-NNNN`): compute inside the transaction after `await txQuery("select pg_advisory_xact_lock(hashtext('aic:<module>-id'))")`, so two saves cannot take the same id.
- **Locks**: a module-level Sheets lock (`ftiWriteLock`, `quotationLock`-style) becomes `pg_advisory_xact_lock(hashtext('aic:<module>'))` inside the transaction.
- **Google side effects** (PDF export, Drive upload, tracker sync, email): never inside a PostgreSQL transaction and never against Google on staging. Skip them on PostgreSQL with a one-line comment `// PostgreSQL: <effect> moves to the outbox (follow-on)` and list them in your report.

## Tests (required for every change)

- Write the test first and watch it fail (on the old code it fails with "Test tried to use Google"), then implement.
- Per batch, one test file `scripts/test-<batch>-postgres.cjs` built on `scripts/lib/ts-harness.cjs` (copy the structure of `scripts/test-dr-writes-postgres.cjs`): reads return the database counts; each write is checked inside a rolled-back transaction (row written, audit `created_by`/`updated_by` = the actor, return value shape unchanged); a final case asserts nothing persisted.
- **Read parity**: add each migrated read to `scripts/test-lookup-parity.cjs` (`compare('<name>', () => load('src/lib/<module>.ts').<reader>(), { key: '<id field>' })`). Parity compares the Sheets path fed by the snapshot with PostgreSQL; it is valid on freshly imported staging, so if staging has drifted, report the differing ids rather than "fixing" the test.
- Before each commit, all must pass:
  - `npx tsc --noEmit -p .` (0 errors) and `npx eslint <changed files>` (0 errors).
  - Every existing suite: `node -e "const p=require('./package.json');console.log(Object.keys(p.scripts).filter(k=>k.startsWith('test:')).join('\n'))"` then run each with `npm run -s <name>` (the PostgreSQL ones need `.env.local`, which they load themselves).
- Commit per module or small group, message `feat(db): <module> on PostgreSQL`, ending with `Co-Authored-By: Codex <noreply@openai.com>`.

## Tasks

Do them in this order. Each batch ends with a commit and a short note in your report: what moved, test names, anything skipped and why.

### Batch 1 — master data (simple CRUD; start here to learn the pattern)
Reads and writes of: `departmentSheets.ts`, `positionSheets.ts` (writes; reads are done), `paymentTermSheets.ts`, `miscellaneousSheets.ts`, `vehicleSheets.ts`, `warehouseSheets.ts` (writes; reads done), `customerPriceSheets.ts`, `companyContactSheets.ts`, `locationAddressSheets.ts`, `userApproverSheets.ts`, then the **writes** of `companySheets.ts`, `productSheets.ts`, `supplierProductSheets.ts`, `productReferenceSheets.ts` (their reads are done — keep them). Watch the row-number id rule (companies, contacts, location addresses).

### Batch 2 — FTI and liquidation (largest; plan §5 builds on it)
`ftiSheets.ts`, `ftiRecalculation.ts`, `ftiWriteLock.ts` (→ advisory lock), `ftiFuelPrice.ts`, `tollMatrix.ts` (the `toll_matrix_rows` grid table: `row_no` + `cells` jsonb, row 1 is the header), `liquidationSheets.ts`, `liquidationReturnSheets.ts`, `attendance.ts`, `fieldWorkLogs.ts`. Reads first (with parity), then writes. FTI totals, statuses and approval fields must round-trip exactly; run `npm run -s test:fti` after every change. `ftiPdfJobs.ts` exports PDFs to Google: skip on PostgreSQL and report it.

### Batch 3 — purchasing, service reports, inventory writes, collections
`purchaseOrderSheets.ts` (PO numbers `AIC-PO-YYYY-NNNN` under an advisory lock), `purchaseRequests/sheets.ts`, `serviceReports/repository.ts` and `serviceReports/writer.ts` (service-report sequences like sales orders), `collectionSheets.ts`, and the **write** functions in `src/lib/inventory/sheets.ts` (`appendMovements`, `setMovementStatus`, `upsertSafetyStock`, `saveTransfer`; its reads are done). Stock writes must run inside `withInventoryLock(...)` exactly where the Sheets path does.

### Batch 4 — coverage and cleanup
1. Extend `scripts/test-pages-zero-sheets.cjs`: add every dashboard page's on-open API routes (find them from `src/app/dashboard/**/page.tsx` and their client components' fetch/axios calls), so the run proves which pages load with 0 Sheets calls. Report the remaining ones by route.
2. `scripts/test-document-handover-commit.cjs` fails on `main` too (`deliveryPrintForm.validateForCompany` is stubbed `{}` in its second loader). Fix the **test** (supply the real `deliveryPrintForm` module or a correct stub), not the app, and add it to an npm script.
3. `contractPeriodSummarySheets.ts`: the period summary is derived data. Do not migrate its writes; describe in your report how it could become a database view (Chris decides).

## Report back

At the end, write `docs/superpowers/migration/04-codex-report.md`: per batch, the modules moved, test files and results, everything skipped (with the reason), every judgement call you made, and any change you need in a file you were told not to edit.

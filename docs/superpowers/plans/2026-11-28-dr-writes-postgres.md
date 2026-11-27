# Delivery Receipt writes on PostgreSQL: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On staging (`DATA_BACKEND=postgres`), creating, editing, promoting, deleting and scanning a Delivery Receipt commits all of its records (DR, items, status history, contract releases, sales-order fulfilment, document handover, stock decision) in one PostgreSQL transaction. Retries return the original result. PDF generation runs afterwards as a retryable job.

**Architecture:** Add a shared write foundation (Tasks 1–3). It consists of a request-scoped transaction that every module's PostgreSQL write joins, an idempotency log for client retries, and an outbox for Google side effects (PDF export, Drive). Each collaborating module gets a PostgreSQL write path behind `isPostgresBackend()` (Tasks 4–7), in the style of the read migration. The DR routes then run their whole save inside one transaction (Task 8). Production stays on Sheets, and every Sheets path is left untouched.

**Tech Stack:** Next.js 16 route handlers, `pg` 8 (pooled, transaction pooler :6543, role `aic_web`), Supabase PostgreSQL 17, harness tests in `scripts/*.cjs` (TypeScript transpiled at load, as in `scripts/test-users-postgres.cjs`).

**Spec:** [Migration plan §4](2026-11-27-supabase-migration.md) and [staging and cutover design](../specs/2026-11-27-supabase-staging-design.md). Current state: `HANDOFF.md` "Plan §4 progress".

## Global Constraints

- "Commit each document, its line items and required business links in one transaction. Protect document numbers with database constraints. Make retries after an interrupted save return the original result, and track PDF or tracker work separately so retrying it cannot duplicate a document." (plan §4)
- Every write sets `aic.actor` (the acting user id, or `system:<job>`). The audit trigger rejects writes without it.
- Never change the Sheets path. Every new branch is `if (isPostgresBackend()) { … }` and production behaviour is byte-identical.
- Reads keep returning Sheets-shaped values (see `src/lib/db/sheetRows.ts`). Writes store typed columns. Link values that point at a deleted parent stay readable through `ref()`.
- DR numbers: next = `max(dr_number) + 1`, floor 3642 (`DR_SEQUENCE_BASE`). Drafts and held statuses (`draft`, `pending_approval`, `rejected`) keep the negative placeholder `-unix_seconds`, and promotion assigns the real number.
- Staging has no Google credentials. Any Google call in a save must be outside the transaction and recorded in the outbox, never awaited before commit.
- Credentials stay in env vars. Never log row contents or secrets.

## Review Focus

1. **Two users saving a DR at the same moment** must get consecutive, distinct DR numbers, never the same one and never a gap from a failed save. Owner: Task 3 (`test: concurrent creates get distinct consecutive numbers`).
2. **A double-click or a network retry** of the same save (same `requestId`) must return the first DR, not create a second. A different payload under the same `requestId` must be refused with 409. Owner: Task 2.
3. **A save that fails halfway** (for example, a sales-order fulfilment error after the DR rows are written) must leave no DR, items, releases or handover rows. Owner: Task 8 (`test: failure after DR insert rolls back every table`).
4. **Promoting a draft with edited items** must leave no rows under the placeholder number (the bug fixed on Sheets in `1a0e80e`). Owner: Task 4.
5. **PDF export failing** (always on staging) must not fail the save. The DR is saved with a pending outbox job, and retrying the job never creates a second DR or document number. Owner: Tasks 3 and 8.

---

### Task 1: Request-scoped transaction that module writes join

**Files:**
- Modify: `src/lib/db/postgres.ts`
- Test: `scripts/test-db-transaction.cjs`

**Interfaces:**
- Produces:
  - `inTransaction<T>(actor: string, work: () => Promise<T>): Promise<T>`: starts a transaction, or joins the current one as a savepoint when already inside one, held in an `AsyncLocalStorage`.
  - `txQuery<T extends object>(sql: string, params?: unknown[]): Promise<T[]>`: runs on the current transaction's client, and throws `"No database transaction is open."` outside one.
  - `currentActor(): string | undefined`.
  - `withTransaction` remains and becomes `inTransaction` plus a client callback, so existing callers (users) keep working.

- [ ] **Step 1: Write the failing tests** in `scripts/test-db-transaction.cjs` against `STAGING_APP_DATABASE_URL`, using a scratch table created in the test's own outer transaction and rolled back at the end:
  - `nested inTransaction joins the outer transaction`: an inner write is visible to the outer, and an outer rollback discards both.
  - `inner failure rolls back to its savepoint only`: the inner throws and is caught by the outer, the outer commits, and only the outer's row exists.
  - `txQuery outside a transaction throws`.
  - `actor is set once for the outer transaction`: `current_setting('aic.actor')` inside the inner equals the outer actor.
- [ ] **Step 2: Run** `node --env-file=.env.local scripts/test-db-transaction.cjs`. Expected: FAIL (`inTransaction is not a function`).
- [ ] **Step 3: Implement** in `src/lib/db/postgres.ts`. Use `AsyncLocalStorage<{ client: PoolClient; actor: string; depth: number }>`. Nested calls use `savepoint sp_<depth>` / `release` / `rollback to`.
- [ ] **Step 4: Run** the test and `npm run test:users-postgres`. Expected: both PASS.
- [ ] **Step 5: Commit** `feat(db): request-scoped transactions with savepoints`.

### Task 2: Idempotent requests

**Files:**
- Create: `supabase/migrations/20261128120000_request_log.sql`, `src/lib/db/idempotency.ts`
- Test: `scripts/test-db-idempotency.cjs`

**Interfaces:**
- Consumes: `inTransaction`, `txQuery` (Task 1).
- Produces:
  - `withIdempotency<T>(requestId: string | undefined, scope: string, payload: unknown, work: () => Promise<T>): Promise<T>`. It must be called inside `inTransaction`. With no `requestId` it simply runs `work`. A replay with the same scope, actor and payload hash returns the stored result. A different hash throws `IdempotencyConflictError` (HTTP 409, message "This request ID was already used for a different save.").
  - Table `aic.request_log(request_id text primary key, scope text not null, actor text not null, payload_sha256 text not null, result jsonb not null, …audit columns)`, RLS policy for aic_app, in the same migration.

- [ ] **Step 1: Write the failing tests**:
  - `first call runs work and stores result`.
  - `replay returns stored result without running work` (a counter stays at 1).
  - `different payload same id → 409`.
  - `concurrent duplicate waits and replays`: two parallel transactions with the same id, one runs, and the other gets the stored result after commit. Use `insert … on conflict do nothing` plus `select … for update`.
- [ ] **Step 2: Run** and expect FAIL (no table).
- [ ] **Step 3: Apply the migration** (`apply-migrations.mjs`), then implement `withIdempotency`. The payload hash is the sha256 of `JSON.stringify` with sorted keys.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): idempotent request log`.

### Task 3: Document numbers and the side-effect outbox

**Files:**
- Create: `supabase/migrations/20261128121000_outbox.sql`, `src/lib/db/outbox.ts`, `src/lib/db/sequences.ts`
- Test: `scripts/test-db-outbox-sequences.cjs`

**Interfaces:**
- Produces:
  - `nextDrNumber(): Promise<number>`. Inside a transaction it takes `pg_advisory_xact_lock(hashtext('aic:dr-number'))`, then returns `max(dr_number where dr_number > 0)` + 1, floor 3642 → 3643. The DR primary key is the constraint.
  - `enqueueSideEffect(kind: "dr.pdf" | "si.pdf" | "quotation.pdf" | "tracker.sync", documentKey: string, payload: Record<string, unknown>): Promise<string>`. It inserts into `aic.outbox`, deduplicated on `(kind, document_key)` while `status = 'pending'`.
  - `runPendingSideEffects(kind, handler: (job) => Promise<void>, limit = 10): Promise<{ done: number; failed: number }>`. It claims jobs with `for update skip locked`, records `attempts` and `last_error`, and marks them `done` or leaves them `pending`.
  - Table `aic.outbox(id bigint identity, kind, document_key, payload jsonb, status text check in ('pending','done','failed'), attempts int, last_error text, next_attempt_at timestamptz, …audit)`.

- [ ] **Step 1: Write the failing tests**:
  - `concurrent creates get distinct consecutive numbers`: 5 parallel transactions each call `nextDrNumber` and insert a scratch DR. The numbers are 5 consecutive integers. Roll everything back.
  - `enqueue twice for the same document keeps one pending job`.
  - `failed handler keeps the job pending with attempts=1 and last_error set`.
  - `two workers never claim the same job`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Apply the migration and implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): DR numbering under lock and side-effect outbox`.

### Task 4: DR header, items and status history on PostgreSQL

**Files:**
- Create: `src/lib/deliveries/postgresDeliveryWrites.ts`
- Modify: `src/lib/deliverySheets.ts` (branches in `processDeliveryReceipt`, `updateDeliveryReceipt`, `deleteDeliveryReceipt`, `recordDeliveryReceiptScan`, `completeDeliveryReceiptFromScan`), `src/lib/transactionItemSheets.ts` (`replaceDeliveryItems`, `renameDeliveryItemReferences`, `updateDeliveryItemSerials`)
- Test: `scripts/test-dr-writes-postgres.cjs`

**Interfaces:**
- Consumes: `inTransaction`, `txQuery`, `nextDrNumber`, `enqueueSideEffect`.
- Produces (all require an open transaction):
  - `insertDeliveryReceipt(header: DeliveryHeaderRow): Promise<void>`. `DeliveryHeaderRow` has the typed columns of `aic.delivery_receipts`, named as in `sheetColumns.generated.ts` → `DeliveryReceipts`.
  - `updateDeliveryReceiptRow(drNumber: number, changes: Partial<DeliveryHeaderRow> & { dr_number?: number }): Promise<void>`. Renumbering on promotion updates the primary key, and the items' foreign key follows (`on update cascade`, added in this task's migration `20261128122000_dr_fk_cascade.sql` for `delivery_receipt_items`, `delivery_receipt_status_history`, `service_invoices`, `sales_invoices`).
  - `replaceDeliveryItemsPg(drNumber: number, items: DeliveryItem[]): Promise<void>` (delete + insert, keeping `item_no` order).
  - `appendStatusHistory(drNumber: number, oldStatus: string, newStatus: string, changedBy: string): Promise<void>`.
  - The public functions in `deliverySheets.ts` keep their signatures and return the same `DeliveryReceiptSummary`. In PostgreSQL mode they call `inTransaction(actor, …)` and enqueue `dr.pdf` instead of exporting.

- [ ] **Step 1: Write the failing tests**. Run each inside an outer transaction that is rolled back; the harness wraps everything in `inTransaction('test:dr-writes', …)` and throws at the end:
  - `create finalized DR gets next number, items and history`: number = reconciled next (4111 on snapshot 1), items in order, no history row on create (as on Sheets).
  - `create draft keeps negative placeholder and enqueues no PDF`.
  - `promote draft with edited items leaves no placeholder rows` (Review Focus 4).
  - `promote draft without items re-keys existing items`.
  - `delete soft-deletes header (status "deleted") and removes items`.
  - `edit returns the same DeliveryReceiptSummary shape as the Sheets path`: compare keys and types with a summary from `getDeliveryReceipts()`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** the branches. Keep all validation (FOR client, delivered-by, reference mode, no-charge rules) shared above the branch, exactly where it runs today.
- [ ] **Step 4: Run** the tests, `npm run test:delivery-releases` (Sheets path unchanged) and `npm run test:lookup-parity`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(deliveries): DR header, items and history writes on PostgreSQL`.

### Task 5: Contract releases and inventory lock on PostgreSQL

**Files:**
- Modify: `src/lib/contractReleaseSheets.ts` (`appendContractReleases`, `addContractRelease`, the release status updates in `deleteDeliveryReceipt`), `src/lib/inventory/lock.ts` (`withInventoryLock`)
- Test: `scripts/test-dr-writes-postgres.cjs` (new cases)

**Interfaces:**
- Produces:
  - In PostgreSQL mode `withInventoryLock(work)` takes `pg_advisory_xact_lock(hashtext('aic:inventory'))` inside the current transaction (opening one with the session actor if needed) and runs `work`.
  - `appendContractReleases(rows)` inserts into `aic.contract_releases` in the current transaction.
  - `ContractPeriodSummary` is not written on PostgreSQL. It is derived (data inventory), and a view replaces it in a later plan. Document that in the function comment.

- [ ] **Step 1: Write the failing tests**: `contract DR creates releases in the same transaction`, `deleting the DR marks its releases Deleted`, `inventory lock serialises two stock-affecting saves` (the second waits until the first commits).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm run test:contracts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): contract releases and inventory lock on PostgreSQL`.

### Task 6: Document handover on PostgreSQL

**Files:**
- Modify: `src/lib/documentHandoverCommit.ts` (`commitDocumentWithHandover`), `src/lib/documentHandoverSheets.ts` (`ensureAutomaticDocumentHandover`, `returnDocumentFromScan`, `getDocumentHandovers` read)
- Test: `scripts/test-dr-writes-postgres.cjs` (new cases)

**Interfaces:**
- Produces: the same return values (`"created" | "updated" | "unchanged"`). In PostgreSQL mode the DR row update and the handover upsert run in the current transaction. The `document_handovers(document_type, document_number)` index becomes **unique** (migration `20261128123000_handover_unique.sql`; snapshot 1 has no duplicates, so verify first with a query in the test).

- [ ] **Step 1: Write the failing tests**: `finalizing a DR creates one handover`, `re-saving does not duplicate it` (unique index), `a manual custody decision is preserved` (the existing "unchanged" rule).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): document handover writes on PostgreSQL`.

### Task 7: Sales-order command writer on PostgreSQL

**Files:**
- Modify: `src/lib/salesOrders/repository.ts` (`writeSalesOrderCommand`, `withDirectWriteLock`, `deleteDraftSalesOrderRows`)
- Test: `scripts/test-sales-order-commands-postgres.cjs`

**Interfaces:**
- Consumes: `inTransaction`, `txQuery`.
- Produces: `writeSalesOrderCommand(command: DirectWriteCommand): Promise<DirectWriteResult<T>>`, with the same contract. In PostgreSQL mode it reads only the affected order's rows with `select … for update`. It applies the same decisions (replay check on `sales_order_commands`, version check, number assignment from `sales_order_sequences` with `for update`) and writes the order, items, history, documents, fulfilments, links, sequence and command rows in the current transaction. `withDirectWriteLock` becomes `pg_advisory_xact_lock(hashtext('aic:sales-orders'))`.

- [ ] **Step 1: Write the failing tests**. Reuse the existing domain tests' command fixtures from `scripts/sales-order-tests/`:
  - `replayed command returns stored result`.
  - `version conflict is reported`.
  - `confirm assigns AIC-SO-2026-1485 and bumps the sequence` (snapshot 1 sequence 1484).
  - `fulfilment from a DR posts in the DR's transaction` (roll back the outer transaction → no fulfilment row).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.** Keep the decision logic shared by extracting it from the Sheets body into a pure function `planSalesOrderCommand(source, command)` that both paths call. That extraction is the only change to the Sheets path, and `npm run test:sales-orders` proves it.
- [ ] **Step 4: Run** the tests and `npm run test:sales-orders`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sales-orders): command writer on PostgreSQL`.

### Task 8: DR routes save in one transaction; PDF via outbox

**Files:**
- Modify: `src/app/api/deliveries/route.ts` (POST), `src/app/api/deliveries/[id]/route.ts` (PUT, DELETE), `src/app/api/deliveries/save-pdf/route.ts`, `src/app/api/deliveries/upload-scanned/route.ts`
- Create: `src/app/api/jobs/side-effects/route.ts` (POST, admin or `CRON_SECRET`; runs `runPendingSideEffects('dr.pdf', …)` with the existing `populateAndExportDeliveryReceiptFormPdf`)
- Modify: `src/lib/services/delivery.service.ts` (send a `requestId`: `crypto.randomUUID()` per form submission, reused on retry)
- Test: `scripts/test-dr-routes-postgres.cjs`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - In PostgreSQL mode each mutating handler body runs as `inTransaction(session.userId, () => withIdempotency(body.requestId, "dr.<action>", body, …))`. The response gains `pdfStatus: "pending" | "ready"` and keeps every existing field.
  - The Sheets mode handlers are unchanged.

- [ ] **Step 1: Write the failing tests** (route handlers called directly, as in `scripts/test-pages-zero-sheets.cjs`, Google refused):
  - `POST creates DR, items, releases, handover and SO fulfilment; 0 Sheets calls; pdfStatus pending`.
  - `same requestId twice returns the same drNumber` (Review Focus 2).
  - `failure after DR insert rolls back every table`: inject a thrown fulfilment error and assert that the counts of all affected tables are unchanged (Review Focus 3).
  - `PUT promote, DELETE, and upload-scanned on PostgreSQL; 0 Sheets calls`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `npm run test:zero-sheets`, `npm run test:delivery-releases` and lint plus type-check. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(deliveries): transactional DR saves on PostgreSQL with outbox PDFs`.
- [ ] **Step 6: Staging check (Chris).** On aic-staging, create a draft DR, promote it with an edited line, edit it, scan-complete it and delete a test DR. Each save succeeds with "PDF pending". Then run `npm run reconcile` against staging and confirm the next DR number advanced by exactly the DRs created. **Before this step, re-import staging from a fresh snapshot** so that test DRs never mix with production inputs (the plan's "keep staging test entries out of production inputs").

## Follow-on plans (same foundation)

- Service and sales invoices: `invoiceRepository` writes, `postFulfillments`, the tracker sync via the outbox, and invoice numbers from the physical form (unique constraint on `invoice_no`).
- Quotations: save, send (email via the outbox, with a staging recipient allow-list), and history.
- PDF and Drive destinations for staging (template copies, Drive folders) so that outbox jobs can actually run there. This needs Chris to share the staging copies with the service account.

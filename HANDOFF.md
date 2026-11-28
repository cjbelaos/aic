# Claude handoff for the AIC Supabase migration

Prepared 27 November 2026 for the next Claude Code session in `C:\Users\chris\aic`.

## Goal and starting state

Implement the [seven-phase migration plan](docs/superpowers/plans/2026-11-27-supabase-migration.md) using the [staging and cutover design](docs/superpowers/specs/2026-11-27-supabase-staging-design.md). Chris requested planning and this handoff from Codex and intends Claude to implement. The repository is on `main`. The plan, design and this handoff are local files. Start in this checkout so they are available. Preserve unrelated working-tree changes.

Google Sheets is still the live operational store. The planning session inspected source code but did not reproduce a production failure, create schema migrations, copy data, provision Vercel or deploy an app. There are no failed migration attempts to resume. Chris identified Supabase project `yxevopwnqrbxoekclbda` as empty and designated it for staging. Project access, Vercel team access and deployment protection still need verification.

## First implementation task

1. Read `CLAUDE.md`, `AGENTS.md` and the AIC KOS project context they reference. Run `git status --short --branch`. Read the local plan and design. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`.
2. Start with plan section 1. Reproduce Chris's **page-opening** scenario using one account. Open Delivery Receipts (DR), Service Invoices and Quotations in quick succession, then repeat with a second DR tab as the fourth. Record times, failed routes and upstream status or quota details where observable. Chris paraphrased the error as “app exceeds its per-minute quota.” No exact status, timing or quota bucket has been captured.
3. Trace each page's read path from authentication through shared lookups to the register. Start with `rg -n 'getSheetsClient|spreadsheets\.values' src scripts`. The invoice GET route reads invoices, an order snapshot and, conditionally, delivery links. Overlapping reads are the working explanation for the symptom. Concurrent document **saves** are a separate regression test.
4. Produce a source-to-destination inventory with keys, formulas, relationships, historical values, jobs and external destinations. Use it to design the schema and importer. Continue in plan order. Keep credentials in the configured secret store or local environment and out of logs, exports in Git and Markdown.

## Decisions to carry through implementation

- **Data copies.** Import current Sheets once for testing, including all users, roles and reporting relationships. Use a separate private Vercel project accessible only to Chris. Restrict site and API access independently of the copied user list.
- **Isolation.** Give test PDFs, uploads, templates and tracker updates staging destinations. Inspect the scheduled FTI PDF job in `vercel.json`. Verify where it writes before enabling it. Keep test transactions out of production.
- **Go-live.** Chris accepts a brief pause. Rehearse and time it first. When Chris schedules cutover, pause all writers, drain pending work and import the latest live records into a separate production database. Reconcile counts, keys, totals, approval states and references before reopening writes. AIC becomes the official editing interface. Staff lose direct edit access to the old operational Sheets. The implementation handoff does not schedule the production switch.
- **Return for revision.** Managers and higher-level leaders may return FTIs and expense liquidations within their reporting line. The plan includes direct and indirect reports. Superadmins may act across employees. Enforce permission server-side. A requester edits and resubmits a returned record. Track who returned it, the reason and the approved version.
- **Independent approvals.** An authorized manager can return an approved FTI while its liquidation stays approved. The approved liquidation must continue showing the dates and amounts Finance approved. Returning the liquidation is a separate action.
- **Open Finance decision.** Preserve recorded cash-return payments and proof. Before enabling revisions that change amounts on those liquidations, confirm how Finance wants to reconcile the difference. Proceed with the baseline, schema discovery and unrelated migration tasks in the meantime.

## Code and verification pointers

| Path | What to inspect |
| --- | --- |
| `src/lib/googleSheets.ts` and `src/lib/auth/session.ts` | Sheets access and request authentication, including dependencies shared across pages |
| `src/app/api/service-invoices/route.ts`, `src/lib/serviceInvoiceSheets.ts`, `src/lib/invoiceRepository.ts` | Invoice register reads, writes and tracker integration |
| `src/lib/deliverySheets.ts` and `src/lib/quotationSheets.ts` | Other pilot registers, document numbering, DR item writes and PDF work |
| `src/lib/inventory/sheets.ts` | Example of module-specific Sheets reads outside the pilot |
| `src/app/api/fti/requests/[controlNo]/route.ts` and `src/lib/ftiSheets.ts` | Existing administrative withdrawal accepts a SENT itinerary. Approved returns need their own eligibility and authorization rules |
| `src/lib/services/liquidation.service.ts` and `src/types/liquidation.ts` | Approved values, receipt evidence and cash-return history |

**First staging acceptance test:** all four tabs display the correct records on their first load, with zero Sheets API calls during page loading. The plan also requires reconciliation of imported records, safe retries, approval-permission tests, persistence of historical figures and a timed cutover rehearsal. Record actual results against the plan as implementation proceeds.

The plan and design are the durable references for this handoff. The memory lookup returned no usable observation IDs.

## Progress (27 November 2026, session 1, Claude)

Plan §1 is done apart from owner answers. §2–3 are built but not yet applied. Nothing is committed. Google Sheets remains the live store, and nothing was written to it.

**Baseline.** See [docs/superpowers/migration/01-four-tab-baseline.md](docs/superpowers/migration/01-four-tab-baseline.md). Root cause: all Google calls go through one service account, so every member of staff shares a single quota of 60 reads per minute. The four-tab workflow makes about 38 reads, so two people doing it at once exceed the quota. The live timed run is deferred: `next dev` plus headless Chrome hangs this laptop. Run it against Vercel instead. The tracer is in place: `SHEETS_TRACE=1` enables `src/instrumentation.ts`.

**Inventory.** See [docs/superpowers/migration/02-data-inventory.md](docs/superpowers/migration/02-data-inventory.md). It assigns a disposition to every tab and external destination, and lists owner questions on reporting lines, legacy tabs and the `Config` credential.

**Migration tooling** (`scripts/migration/`):
- `inspect-workbooks.mjs` reads workbook structure only.
- `capture-snapshot.mjs` makes two read-only batch reads. Output goes to the git-ignored `tmp/migration/`, which contains personal data, so never commit it.
- `profile-snapshot.mjs` reports column shapes, never values.
- `schema-map.mjs` is the single source of truth for schema and import.
- `check-map.mjs` validates the map against a snapshot.
- `generate-schema.mjs` produces `supabase/migrations/20261127090000_aic_schema.sql`.

The current snapshot is `tmp/migration/snapshot-staging-1` (77 tabs, 14,543 rows).

**Schema decisions:**
- Private `aic` schema with RLS on and no API roles.
- Business keys are kept as text, except `dr_number`.
- Exact `numeric` for money.
- Every table ends with `source_row`, `import_raw`, then the four audit columns.
- The audit trigger rejects writes without `aic.actor`. The app role `aic_app` cannot use the import bypass.
- Cells that fail to convert are set to null, with the original kept in `import_raw`.
- Orphaned foreign keys follow the same rule and are reported.
- Serial date-times: FTI, attendance and field logs are Manila wall-clock time. Users and liquidation approvals are UTC.

## Progress (27 November 2026, session 2, Claude)

- Verified by connector: staging `aic` (`yxevopwnqrbxoekclbda`, ap-south-1) is healthy and empty, with no migrations. `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` points at a **different** project, `afcs` (`daiitmfqaurryfkiwfas`).
- `pg` added as a dev dependency. New: `apply-migrations.mjs` (records in `supabase_migrations.schema_migrations`), `convert.mjs` (pure conversion and validation) with `convert.test.mjs` (6 passing), and `import.mjs`.
- Importer design: validation runs offline. The load is **one transaction** (plays the role of the "import area": invisible until commit, rolls back fully on interruption), with in-transaction count reconciliation and an `import_batches` row. Flags: `--dry-run`, `--replace`, `--fail-after=<table>`, `--db-env=`.
- Dry run on `snapshot-staging-1`: 76 tables, 14,537 rows. 1 rejected (duplicate `company_contacts.contact_id`). 174 orphaned refs, mostly `delivery_receipt_items.dr_number` (107) and `.product_id` (26). 141 FTIDetails numeric cells contain text, plus 4 MOA slash-text dates. Full report: `tmp/migration/snapshot-staging-1/import-report.json`. Each discrepancy needs an explanation before acceptance (plan §3 exit check). Investigate the 107 DR-item orphans first.
- `dr_number` is `integer`. Draft DRs use `-unix seconds` placeholders, which fit until 2038.

**Staging database is loaded (same session).** `STAGING_DATABASE_URL` (Session pooler, `aws-0-ap-south-1.pooler.supabase.com`) is in `.env.local`. Three migrations are applied:
- `aic_schema`.
- `audit_stamp_search_path`, a fix for advisor 0011.
- `aic_app_policies`. RLS with no policies hid **every row** from `aic_app`, so `aic_app` now has full policies, and `import_batches` is read-only to it. New tables need their own policy.

Rehearsal results:
- `--fail-after=fti_details` rolled back to 0 rows everywhere.
- The real import promoted 14,537 rows.
- A rerun without `--replace` was refused.
- A rerun with `--replace` produced identical counts.

`verify-import.mjs` passes:
- Counts match across 76 tables.
- 2 batches are recorded.
- The trigger rejects actor-less writes, including by `aic_app` with `importing=on`.
- An actor write stamps `updated_by` and keeps imported null `created_at`.
- `anon` and `authenticated` have no schema usage.

The security advisor is clean. Performance shows only unused-index INFO, which is expected before the app runs.

Note: Supabase `postgres` is not a member of `aic_app`. The verifier grants membership inside a rolled-back transaction. The app will need a login role: `create role aic_web login password … in role aic_app`, or `grant aic_app to` a login role.

**Next:**
1. ~~Reconciliation~~. Done (2026-11-28). `scripts/migration/reconcile.mjs` passes against staging: every business key, 17 per-document money checks (exact decimals) and next numbers (DR 4111, SI 1851, sales invoice 2301, PO 0053, PR 14, ST 2, SO sequence 1484, SR sequence 1). The importer now strips binary float noise from numeric cells (25996.5599999999 → 25996.56), leaving long values such as coordinates intact. Not yet done: a sample check of historical PDF links.
2. ~~Explain discrepancies~~. Done: see [03-import-discrepancies.md](docs/superpowers/migration/03-import-discrepancies.md). The importer now rekeys the reused contact ID (`cont_25~r26`) and reads literal `"NULL"` as blank. Staging was reloaded: 14,431 rows, 0 rejected, 107 excluded, 65 orphans explained. Open owner items: 14 products deleted by hand (restore of all 14 as inactive is **deferred** by Chris; see the 03 log for search hints), invoice 1713 against deleted CTR-0041. Since 65b7156 on main, contract delete is admin-only and blocked while referenced, and staff should set Status=Inactive/Closed instead. Row 1450 is resolved: a deleted draft. Contact ID reuse is fixed on main (0d0e073).

**Resolved: the 107 DR-item orphans.** These were stale copies. Promoting a draft DR *with* an items payload rewrote the items under the real number and left the old rows keyed to the negative placeholder. 12 of 13 drafts match an issued DR (3708, 3741, 3772, 3773, 3916, 3917, 3930, 3931, 3933, 3967, 4019, 4090) by `created_at` within seconds and `draft→…` history. 3 of those were edited at issue (16→17, 20→17, 31→32 lines). One draft (−1795437044, 23 Nov, `DeliveryReceiptItems` row 1450) has no issued DR, and Chris is checking it in the sheet. The importer now excludes items under a negative DR number with no DR row (`report.excluded`). Staging was reloaded: 14,430 rows, verifier passes. The app bug is fixed on branch `fix/draft-promotion-items` (`1a0e80e`, regression test `scripts/test-delivery-draft-promotion.cjs`), which is awaiting Chris's go-ahead to merge to `main`.

DR 3708's status-history row has a Drive URL in `old_status`, from an older column-shift write. It is a cosmetic data quirk.
3. Vercel project `aic-staging` exists (production branch `migration/supabase`, no cron; env: STAGING_DATABASE_URL, AUTH_SESSION_SECRET, JWT_SECRET). The staging lock is in code: `src/proxy.ts` (`SITE_BASIC_AUTH=user:pass` gates every request) plus `ACCESS_ALLOWED_USER_IDS` (only those users can sign in or hold a session), with test `npm run test:restricted-access`. **Chris** must set both env vars on aic-staging and redeploy. Still to do: the app DB login role (`aic_web`).

**Security finding:** `AUTH_SESSION_SECRET` falls back to a hard-coded dev secret, and it is not set locally. Check production.

## Plan §4 progress (2026-11-28)

- **Switch:** `DATA_BACKEND=postgres` plus `DATABASE_URL` (the `aic_web` login role, transaction pooler :6543). Implemented in `src/lib/db/postgres.ts` (`isPostgresBackend`, `dbQuery`, `withTransaction(actor, …)`, which sets `aic.actor`). Production stays on Sheets.
- **`aic_web` role:** `scripts/migration/create-app-role.mjs` creates or rotates it and writes `STAGING_APP_DATABASE_URL` to `.env.local`, never printing the password. Migration `20261128090000` makes the import bypass refuse every member of aic_app (it refused only aic_app by name). Verified as aic_web: reads ok, bypass refused, actor writes stamped, import_batches read-only, no `public` DDL.
- **Step 1, login and users: done.** `userSheets.ts` keeps its validation and hashing and swaps storage to `src/lib/users/postgresUsers.ts`. A delete with FK references gets a friendly refusal. Mobile login also honours `ACCESS_ALLOWED_USER_IDS`. Integration test: `npm run test:users-postgres` (real staging DB as aic_web, throwaway user, cleans up).
- **Step 2, shared lookup reads: done.** Companies, customers, suppliers, products, supplier products, categories, units and delivered-by read from Postgres via `src/lib/db/sheetRows.ts`, which hands each module rows in its sheet column order and text format so the existing parsers run unchanged. `ref()` shows the original value of link columns that were nulled as orphans. **Parity test** `npm run test:lookup-parity`: the same functions on the Sheets path (fed the snapshot) and the Postgres path (staging) give identical records (9 lookups). The only tolerated difference is coordinates, where Sheets returned display-rounded values. Writes to these lookups are not migrated yet; on staging they fail cleanly because there are no Google credentials. `Company.id` (`comp_<row>`) is index-based and must be re-keyed when company writes move.
- **Step 3, register reads: done.** DR (468 with items), service and sales invoices (285/21 with items), quotations (67 with details and notations), sales orders (repository `readTabValues`/`readTabsValues`), and DR→SO links. All have parity with the Sheets path. Range reads use the generated header map (`src/lib/db/sheetColumns.generated.ts`, produced by `scripts/migration/emit-sheet-columns.mjs`; regenerate after schema-map changes). The parity test compares JSON by content, because jsonb reorders keys. Hashes are rebuilt from DB-loaded objects on both sides, so this is safe.
- **Offline acceptance: passes.** `npm run test:zero-sheets` calls every API route the DR, Service Invoices and Quotations pages load on open, with DATA_BACKEND=postgres and a Google client that refuses use: all 200 with data, **0 Sheets calls**. It reports 2 Drive lookups from `identifyLegacyScan` (legacy scan detection by Drive filename, cached 5 min; harmless and could be persisted later).
- **Fixed on the way:** the audit bypass now checks `USAGE`, not `MEMBER` (Supabase's postgres has an admin-only membership in aic_app, so imports were being re-stamped). The verifier now checks lineage. FieldWorkLogs times are text.
- **Live acceptance: passed (2026-11-28).** Chris signed in on aic-staging (site gate + allow-list) and opened DR, Service Invoices, Quotations and a second DR tab. All four loaded with data from PostgreSQL. aic-staging env: SITE_BASIC_AUTH, ACCESS_ALLOWED_USER_IDS (Chris's user id), DATA_BACKEND=postgres, DATABASE_URL (aic_web, :6543), AUTH_SESSION_SECRET, JWT_SECRET; STAGING_DATABASE_URL removed. Sign-in errors no longer show infrastructure messages.
- **DR writes on PostgreSQL: done** (plan [2026-11-28-dr-writes-postgres.md](docs/superpowers/plans/2026-11-28-dr-writes-postgres.md), executed inline, commits 2f425f7..f30d00a; the ledger with every ruling is `.superpowers/sdd/2026-11-28-dr-writes-postgres/progress.md`, git-ignored).
  - **Foundation** (`src/lib/db/`):
    - `inTransaction`/`txQuery`/`currentActor`: AsyncLocalStorage transactions; nested calls become savepoints.
    - `withIdempotency` + `aic.request_log`.
    - `nextDrNumber`: an advisory lock.
    - `aic.outbox` with `enqueueSideEffect`/`runPendingSideEffects`.
    - `runSave`: the route wrapper; one transaction plus requestId replay, 409 on a reused id with a different payload, and error responses roll back.
    - `upsertSheetRows`: a generic writer of sheet-shaped rows using `targets` in `sheetColumns.generated.ts`.
  - **DR**: create, edit/promote, delete, scan and items in one transaction. Business rules are untouched; the code branches only at storage points. Promotion renumbers via ON UPDATE CASCADE (migration 20261128122000). Handover commit and scan return run on PostgreSQL, with a unique (document_type, document_number). Also on PostgreSQL: contract releases, the inventory lock (advisory) and stock-guard reads, positions, warehouses, and the sales-order command writer (its unchanged body runs against a DB-backed stand-in client).
  - **PDFs**: outbox jobs carrying the browser-rendered PDF. `/api/jobs/side-effects` (cron `CRON_SECRET` or admin) deliberately fails them with "needs staging Drive destinations" until the follow-on plan provides staging folders and templates. It must never call the Sheets template exporter on staging.
  - **Tests** (all against staging; each rolls back or cleans up; the harness refuses Google by default):
    - `test:db-transaction`, `test:db-idempotency`, `test:db-outbox-sequences`, `test:handover-postgres`, `test:releases-inventory-postgres`
    - `test:dr-writes-postgres`, `test:sales-order-commands-postgres`, `test:dr-routes-postgres` (it includes a check that no test DR is left behind)
    - plus the earlier `test:lookup-parity` (run right after an import), `test:zero-sheets` and `test:users-postgres`
    - All 20 pre-existing suites pass. Older loaders now fall back to `scripts/lib/sheets-mode-stubs.cjs`.
  - **Incidents (resolved)**:
    - A RED run wrote one test row to the LIVE DocumentHandover tab (row 752). Chris deleted it, and the harness now refuses Google.
    - The scan test committed staging DRs 4111/4112. Chris deleted them, and the test is fixed.
  - **Pre-existing, not fixed**: `scripts/test-document-handover-commit.cjs` (in no npm script) fails on main too.
  - **Staging vs live**: staging is the 27 Nov snapshot, and live has since issued DR 4111. Re-import from a fresh snapshot before Chris test-saves on staging (plan Task 8 step 6).
- **Next:**
  1. Act on the final whole-branch review findings.
  2. Re-import staging fresh.
  3. Chris's staging save check (draft → promote → edit → scan → delete).
  4. Follow-on plans on the same foundation: invoices (`invoiceRepository`, `ensureAutomaticDocumentHandover`, the tracker via the outbox, linked invoice PDF refresh); quotations (save, send via the outbox with a staging recipient allow-list); staging PDF/Drive destinations so outbox jobs can run.

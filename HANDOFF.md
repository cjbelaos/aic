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
1. Reconciliation: keys, invoice and liquidation totals by document, and next document numbers (sales-order and service-report sequences, max DR, invoice and quotation numbers).
2. Explain the dry-run discrepancies, starting with the 107 `delivery_receipt_items.dr_number` orphans (deleted DRs? draft placeholders renumbered?). Then the 26 product orphans and the duplicate contact.
3. Provision the Vercel staging project (plan §2) and create the app login role.

**Security finding:** `AUTH_SESSION_SECRET` falls back to a hard-coded dev secret, and it is not set locally. Check production.

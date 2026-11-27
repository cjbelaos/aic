# AIC Supabase migration implementation plan

**Goal** — Replace Google Sheets as AIC’s operational database and verify that staff can open several registers at once without exhausting the Sheets read quota.

**Architecture** — Deploy the existing Next.js app to a private Vercel staging project backed by the empty Supabase PostgreSQL project `yxevopwnqrbxoekclbda`. Import Sheets once for staging. When ready to go live, take a fresh copy into a separate production database during a brief pause. The imports are independent.

**Design reference** — [Staging and cutover design](../specs/2026-11-27-supabase-staging-design.md)

## 1. Establish the baseline and data map

- [ ] Using the same account, open DR, Service Invoices, Quotations and a second DR tab in quick succession. Capture page-load times, failed requests and the upstream quota error where available. Trace page initialization, including sign-in, shared lookups and dropdowns.
- [ ] Starting at `src/lib/googleSheets.ts`, inventory callers, workbooks, tabs, formulas, scripts and scheduled jobs. Map each operational field to its destination, along with its business key, relationships and validation rules. Distinguish operational records from PDF templates, tracker outputs and Drive files.
- [ ] Identify how AIC represents users, roles, reporting lines, credential verification and historical approvals. Check whether existing liquidation records contain the values Finance approved. Flag missing history and ambiguous reporting relationships for owner review.

**Exit check** — Every operational tab and integration has a disposition. The four-tab workflow has a reproducible test and a recorded baseline.

## 2. Prepare isolated staging

- [ ] Configure the staging database schema through versioned SQL migrations in `supabase/migrations/`. Preserve business document numbers, leading zeros, dates, money precision, foreign keys and legacy status meanings. Use server-only credentials and a connection pool suitable for the deployed app.
- [ ] **Audit columns (decided 2026-11-27).** Every table, including line items, lookups and link tables, ends with `created_by`, `created_at`, `updated_by`, `updated_at`. Postgres only: live Sheets stay unchanged before cutover. A trigger maintains `updated_at`, and the "by" columns come from the app user set on each transaction. On import, copy the source value where one exists. Otherwise leave it null and mark the row as imported. Never invent dates or users. No general change-log table. Approval history stays in the FTI and liquidation history tables.
- [ ] Configure a separate Vercel project and restrict access to Chris across its deployment URLs and API routes. Scope credentials to staging. Give document generation and tracker updates dedicated test destinations. Disable the scheduled FTI PDF job in `vercel.json` for staging until its destinations are verified.
- [ ] Verify that Chris can access staging and an unauthenticated visitor or another account cannot. Generate a test document and trace every write to its staging destination before enabling background work.

## 3. Build and verify the first import

- [ ] Build a repeatable importer under `scripts/migration/` that reads a captured source snapshot, validates it, then loads parent records before children. Restrict the source credential to read access. Record source identifiers, counts and rejected rows without logging credentials or sensitive record contents.
- [ ] Import all users, roles, reporting relationships and operational records into staging. Preserve legacy links to documents. Use an isolated import area and promote validated data together so an interrupted import cannot expose partial records.
- [ ] Rehearse interruption and retry against a disposable database using the same snapshot. Verify stable counts, no duplicates, no orphaned links and correct next document numbers. Reconcile invoice and liquidation totals by document and currency, plus a sample of historical PDFs and their references.

**Exit check** — Explain every discrepancy before using the imported dataset for acceptance testing. Keep staging test entries out of subsequent production inputs.

## 4. Move the application to PostgreSQL

- [ ] Migrate authentication and shared lookups first. Preserve existing role checks and user identities. Then migrate DR, Service Invoices and Quotations through the existing service boundaries in `src/lib/deliverySheets.ts`, `src/lib/invoiceRepository.ts` and `src/lib/quotationSheets.ts`. Read the pinned Next.js documentation before changing application code.
- [ ] Filter and paginate list queries in the database. Cover the filters and joins used by the three registers with appropriate indexes. Preserve the visible list, search, sorting and print behavior in comparisons against the same source snapshot.
- [ ] Commit each document, its line items and required business links in one transaction. Protect document numbers with database constraints. Make retries after an interrupted save return the original result, and track PDF or tracker work separately so retrying it cannot duplicate a document.
- [ ] Migrate the remaining workflows from the inventory, including FTI, liquidation, collections, inventory, master data and reporting. Replace operational Sheet reads and writes in jobs as well as web routes. Verify each module’s read, create, edit and approval paths as applicable.

## 5. Deliver independent FTI and liquidation revisions

- [ ] Extend the workflow behind `src/lib/ftiSheets.ts` and `src/lib/services/liquidation.service.ts`. Enforce return permissions on the server. Managers and higher-level leaders may act within their reporting line, including indirect reports. Superadmins may act across employees. Test direct report, indirect report, unrelated employee, requester and superadmin cases.
- [ ] Persist the return reason, actor, timestamp and approved revision. Let the requester edit and resubmit under the same reference. Reject stale concurrent actions and retain approval history.
- [ ] Keep the two approvals independent. Return an approved FTI, change its date or amount, then resubmit it. Verify its linked approved liquidation retains its approval and original figures. Separately return, edit and reapprove a liquidation and verify its FTI retains its approval.
- [ ] Before enabling revisions on liquidations with a recorded cash return, confirm with Finance how to handle a changed amount when payment and proof already exist. Preserve recorded payment evidence during migration. The adjustment policy is an open business decision.

## 6. Accept the private test deployment

- [ ] Repeat the four-tab baseline against the deployed staging URL. Require correct records on the first attempt in every tab and **zero Sheets API calls during page loading**. Capture elapsed times and errors for comparison with the baseline.
- [ ] Submit a DR and a service invoice concurrently for unrelated customers. Verify one complete document per submission, matching totals and correct business links. Interrupt a response and retry to verify duplicate protection.
- [ ] Verify the remaining workflows, role boundaries, financial reconciliations and staging-only PDF and tracker outputs. Rehearse the final import and verification against a disposable production-like target using the captured snapshot. Record the elapsed time to size the pause.

## 7. Cut over and verify production

- [ ] Prepare a separate production database with the tested schema. Verify backup and restore, environment settings, destination ownership and readiness of the old app for rollback. Schedule the pause using the rehearsal duration.
- [ ] Pause app submissions, direct Sheet edits and background writers. Drain in-progress work, capture the latest Sheets snapshot and import it into the clean production database. Repeat the reconciliations from step 3. Include records added, corrected or deleted since the staging snapshot.
- [ ] Switch the production app while staff writes are still paused. Verify sign-in, the four-tab test, representative records, approvals and document links. If verification fails, switch back to Sheets before resuming writes.
- [ ] Reopen AIC submissions and make the original operational Sheets read-only for staff. Monitor errors, query latency, failed saves and pending document jobs through a normal busy period. If rollback becomes necessary after new database writes, pause again and reconcile those writes before reverting.

**Completion evidence** — Import reconciliation, four-tab traces, permission and revision test results, the timed cutover rehearsal, and production smoke-test results.

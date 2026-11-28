# DR writes on PostgreSQL: execution ledger

Copied from the git-ignored plan workspace when the plan finished (2026-11-28). Every judgement call made during execution and the final review, with what it costs if wrong.

Spec: docs/superpowers/plans/2026-11-27-supabase-migration.md §4 + docs/superpowers/specs/2026-11-27-supabase-staging-design.md
Merge base: 65b7156 (main)

## Pre-flight
| T1 inTransaction/txQuery/currentActor → T2,T3,T4,T5,T6,T7,T8 | consistent names/signatures | ok |
| T1 withTransaction kept → postgresUsers.ts (users) | must keep (actor, client=>…) contract | ok, T1 test runs test:users-postgres |
| T3 nextDrNumber/enqueueSideEffect → T4,T8 | consistent | ok |
| T2 withIdempotency(requestId,scope,payload,work) → T8 | consistent | ok |
| T5 withInventoryLock(work) has no actor param; plan says "opening one with the session actor" | resolve actor via currentActor() else getSession() | Ruling below |
| T3 concurrency test vs "roll back everything" | serialised advisory lock + rollback means max() never moves, so numbers can't be consecutive unless txs commit | Ruling below |

Ruling: T3 concurrent-numbering test commits its scratch DRs (dr_number from nextDrNumber, status 'test') and deletes them in cleanup — only way to observe serialised allocation; staging is re-imported before Chris's checks (plan T8 step 6) — cost if wrong: transient test rows on staging if cleanup crashes (verifier/reconcile would flag them).
Ruling: T5 withInventoryLock in pg mode joins the current transaction, or opens one with actor = currentActor() ?? session userId — plan says "session actor"; reuse the open tx's actor first so the lock and writes share one transaction — cost if wrong: none observable (same actor).
Ruling: shared test loader scripts/lib/ts-harness.cjs (TS transpile + @/ resolution + mocks) used by all new .cjs tests — DRY over copying the loader into 6 files — cost if wrong: none.
Task 1: complete (commits 2f425f7..ff85c1e, tests: npm run -s test:db-transaction → db-transaction: all 5 passed)
Task 2: Ruling: request_log (and Task 3 outbox) describe app writes, so import --replace must truncate them too — otherwise a replay could return a DR that the re-import removed — handled in Task 3 — cost if wrong: stale replays on staging after re-import.
Task 2: complete (commits ff85c1e..4c2d9b9, tests: npm run -s test:db-idempotency → db-idempotency: all 6 passed)
Task 3: complete (commits 4c2d9b9..144b5f8, tests: npm run -s test:db-outbox-sequences → db-outbox-sequences: all 7 passed)
Ruling: execution order T6 → T5 → T4 → T7 → T8 — processDeliveryReceipt writes the DR header through commitDocumentWithHandover (T6) and deleteDeliveryReceipt updates contract releases (T5), so T4's tests cannot pass before them; SO-linked DR deletes/fulfilment are tested in T8 after T7 — cost if wrong: none (same deliverables, different order).
Incident (Task 6 RED run): harness did not block Google; commitDocumentWithHandover's Sheets path appended one test row to LIVE DocumentHandover (row 752, DR 987654, by test:handover). Chris deleted it (verified: 0 test rows remain). Fix: scripts/lib/ts-harness.cjs refuses @/lib/googleSheets and googleapis by default.
Task 6: Ruling: ensureAutomaticDocumentHandover (only used by invoices) moves to the invoices follow-on plan — not on any DR path — cost if wrong: invoice saves on staging fail until that plan.
Task 6: Ruling: regression found — earlier read-migration commits broke 4 npm suites (old loaders stub unknown "@/" imports as {}); fixed with scripts/lib/sheets-mode-stubs.cjs as the loaders' fallback (13 files), all 20 suites pass — cost if wrong: none; tests only.
Task 6: pre-existing (not fixed): scripts/test-document-handover-commit.cjs (not in any npm script) fails on main too (deliveryPrintForm.validateForCompany stubbed {}).
Task 6: complete (commits 144b5f8..3be118d, tests: npm run -s test:handover-postgres → handover-postgres: all 8 passed)
Task 5: Ruling: also migrated inventory/sheets.ts readRows and positionSheets.getPositions — the DR stock guard inside withInventoryLock reads stock and positions; without them every stock-affecting DR save on staging still calls Sheets, and getPositions' .catch(()=>[]) would silently lower permissions — cost if wrong: none (reads with parity helpers).
Task 5: Ruling: generateReleaseId on PostgreSQL takes its lock inside the caller's transaction; called outside one it opens its own, so callers must run it in the save's transaction (T8 does) — cost if wrong: duplicate REL id → PK error on save.
Task 5: complete (commits 3be118d..4b4b618, tests: npm run -s test:releases-inventory-postgres → releases-inventory-postgres: all 4 passed)
Task 4: Ruling: branched only at storage points inside processDeliveryReceipt/updateDeliveryReceipt (validation untouched) instead of extracting shared validation functions — keeps the Sheets path byte-identical and every business rule shared — cost if wrong: none observable; more `pg ?` branches in a long file.
Task 4: Ruling: on PostgreSQL the status-history write is not wrapped in try/catch (Sheets tolerated failure) — inside a transaction a swallowed error would leave it aborted; a failed history write now fails the save — cost if wrong: a save fails where Sheets would have saved without history.
Task 4: Ruling: lookup-parity ignores users.lastLogin and says to run right after an import — staging sign-ins (Chris) legitimately change it — cost if wrong: none.
Task 4: Ruling: recordDeliveryReceiptScan/completeDeliveryReceiptFromScan (scan route) deferred to Task 8 with the scan route — they are only called from upload-scanned — cost if wrong: none (T8 covers them).
Task 4: complete (commits 4b4b618..5626adc, tests: npm run -s test:dr-writes-postgres → dr-writes-postgres: all 8 passed)
Task 7: Ruling: instead of extracting a pure planSalesOrderCommand, the unchanged body runs against a stand-in Sheets client (DB-backed reads; captured batchUpdate translated to upserts by key) — zero logic duplication and the Sheets path is a pure move (test:sales-orders green) — cost if wrong: if the body ever starts reading other tabs for decisions, the stand-in returns [] for them; documented in the function comment.
Task 7: TDD order slip — implementation written before the test; RED verified afterwards by stashing the change (old code: Google refused / no version check), then GREEN 4/4.
Task 7: complete (commits 5626adc..bd9053c, tests: npm run -s test:sales-order-commands-postgres → sales-order-commands-postgres: all 4 passed)
Task 8: Ruling: contract-release and SO-fulfilment failures stay tolerated on create/edit (as on Sheets) — they now run as nested savepoints, so a failure undoes only its own writes and the DR commits with contractReleaseError / PENDING_RECONCILIATION; Review Focus 3 is tested with an injected outbox failure, which rolls back everything — cost if wrong: a DR without its release rows when releases fail (same as today).
Task 8: Ruling: the outbox runner does NOT call populateAndExportDeliveryReceiptFormPdf (Sheets template + Sheets reads) — on staging with credentials it could write into a live workbook; jobs carry the browser-rendered PDF and fail with a clear "needs staging Drive destinations" error until the follow-on plan — cost if wrong: PDFs stay pending on staging (visible in aic.outbox).
Task 8: Ruling: requestId is generated per save call in delivery.service and reused for one automatic resend on a lost response; double-click protection stays with the form's disabled-while-saving state — cost if wrong: a deliberate second click with a new id creates a second DR (as today).
Task 8: Ruling: regenerateStoredServiceInvoicePdfsForDr skipped on PostgreSQL (invoices plan) — best-effort today — cost if wrong: linked invoice PDFs not refreshed on staging.
Task 8: Ruling: warehouseSheets.getWarehouses read migrated (activeWarehouseError in every finalized DR save) — plan missed it — cost if wrong: none.
Task 8: Incident: the scan-upload test used a second harness whose transaction module was separate, so its POST committed — test DRs 4111 and 4112 (comments route-…) persisted on staging. Fixed the test (rollback through the same harness + residue check). Removed their outbox jobs, handovers, history and items; deleting the two DR header rows was DECLINED — awaiting Chris (delete, or re-import staging). Task 8 not marked complete: residue check fails until then.
Task 8: complete (commits bd9053c..f30d00a, tests: npm run -s test:dr-routes-postgres → dr-routes-postgres: all 7 passed)
Task 8: Chris deleted DR 4111/4112 headers in the SQL editor (verified 0 created DRs remain).
Final: fixed Critical 1 (automatic resend on the Sheets path could duplicate DRs) — test-delivery-service-resend RED→GREEN
Final: fixed Important 2 (silent rollback on COMMIT after a caught error) — 'a caught failing statement fails the save…' RED→GREEN; fulfilment wrapped in its own savepoint; tolerated reads are savepoints via dbQuery
Final: fixed Important 3 (pool exhaustion: reads inside a save took a second connection) — 'dbQuery inside a save sees its own writes' RED→GREEN; connectionTimeoutMillis 10s
Final: fixed Important 4 (contract/contract-item/contract-note and DR-linked-invoice reads still on Sheets) — 'contracts, contract items and DR-linked invoices read from the database' RED→GREEN
Final: fixed Important 5 (rows saved in one transaction read back in storage order) — 'items read back in line order after an edit moves a row' RED→GREEN
Final: fixed Important 6 (scan upload would write to the production Drive folder from staging; DB steps not one transaction) — 'upload-scanned is refused on PostgreSQL until a staging scan folder is configured' + staging-folder assertion RED→GREEN
Final: fixed Important 7 (staging gate blocked the Vercel cron for /api/jobs/side-effects) — restricted-access cron cases RED→GREEN
Final: minor (deferred): outbox runner runs the handler inside the job's transaction without a savepoint and has no max-attempt ("failed") state (outbox.ts).
Final: minor (deferred): appendDrStatusHistoryPg / replaceDeliveryItemsPg take max(line_no)+1 without a lock; concurrent unguarded saves can duplicate line_no (not unique; cosmetic).
Final: minor (deferred): draft placeholder -unix_seconds: two drafts created in the same second now hit the primary key (second returns an error; on Sheets they silently collided).
Final: minor (deferred): save-pdf on PostgreSQL does not check the DR exists / is finalized and stores large base64 in the outbox payload.
Final: minor (deferred): POST/PUT DR routes now answer a malformed JSON body with 400 instead of 500 on the Sheets path too.
Final: minor (deferred): runSave returns raw error messages with 500 (can expose table/constraint names).
Final: minor (deferred): crypto.randomUUID() in delivery.service needs a secure context (plain-HTTP LAN dev would throw).
Final: minor (deferred): sheetRows(where) takes a raw SQL fragment (all callers pass constants; document or replace with column+value).
Final: Ruling: reviewer's "Incident 2 still open" — resolved before the review finished (Chris deleted DR 4111/4112; 0 created DRs remain) — cost if wrong: none.

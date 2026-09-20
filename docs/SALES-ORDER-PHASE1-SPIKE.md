# Sales Order Phase 1 — Rules and Synchronization Spike

Status: **In progress — locally verifiable gates have evidence; deployment and
legacy-workbook gates remain blocked on live external access.**
Baseline: 19 September 2026. Evidence produced in this repository; no live
workbook was modified and no Google tab was created or changed.

> **Update (20 September 2026):** the claims below predate the completion pass.
> Treat this doc as historical. The current state is tracked in
> [`SALES-ORDER-COMPLETION-CHECKPOINT.md`](./SALES-ORDER-COMPLETION-CHECKPOINT.md).
> The correction pass now executes actual `Code.gs` and the TypeScript service,
> client and repository in `scripts/sales-order-tests/apps-script-test.mjs`.
> Google service boundaries are mocked; this does not prove live deployment.
> Earlier flush-based atomicity and A:V ownership claims were incorrect and
> are superseded by the writer README and current checkpoint.

## Executive summary

Phase 1 exists to prove the concurrency and synchronization design before
production writes. This spike produced a working local proof for the parts
that can run without Google credentials — the command protocol, the lock
gateway simulation, serialization of overlapping confirmations, idempotent
retries, and lease recovery — by exercising the **real** implementation files
(`src/lib/salesOrders/protocol.ts`, `sync.ts`, `domain.ts`, `money.ts`) rather
than copies. Live Apps Script behavior and legacy workbook internals could not
be inspected from this environment; those gates are recorded with concrete
blockers and safe verification scripts, without guessing.

## Gate 1 — Scheduler mechanism — SELECTED (proof blocked)

Selection: **Apps Script time-driven trigger inside the gateway project, calling
`processDueJobs_()` through the same `LockService` boundary that guards all
writes.** Rationale:

- The worker must run independently of a browser or an HTTP request's lifetime
  and must perform destination publication and source acknowledgment through
  the locked gateway. Running the scheduler inside the gateway runtime keeps
  claim → publish → acknowledge in one trusted process with one secret.
- Vercel Cron remains the fallback if the time-driven trigger is unacceptable
  for the deployment (e.g. hosting keeps the project offline); the worker
  entry point is a plain function so either carrier can invoke it.
- An in-process `setInterval` inside Next.js was rejected: it does not
  coordinate multiple instances and dies with the request lifecycle.

Proof required before acceptance: deploy the gateway, install the trigger
(5-minute interval recommended), and record a run where a job is claimed,
published to a **staging** destination, and acknowledged — plus a crash test.

## Gate 2 — Lock gateway authentication and timeout behavior — LOCAL EVIDENCE, deployment blocked

Evidence available locally:

- `scripts/sales-order-tests/protocol-test.ts` — HMAC-SHA256 signing and
  verification: wrong secret fails, tampered `payloadHash` fails, a 10-minute
  old envelope is rejected, a future-dated envelope inside the skew window is
  accepted, protocol version is pinned (all PASS).
- `apps-script/sales-order-writer/Code.gs` implements the matching server side:
  `verifyEnvelope_`, `LockService.getScriptLock().waitLock(8000)` with a
  503 `GATEWAY_BUSY` on timeout, and `badRequest` on signature failure.

Blocker: without a connected Google account the actual
`LockService.waitLock` timeout semantics and web-app deployment behavior could
not be exercised. Deployment proof checklist is in
`apps-script/sales-order-writer/README.md`.

## Gate 3 — Overlapping invocations serialize — LOCAL EVIDENCE (real logic)

- `scripts/sales-order-tests/concurrency-test.ts` runs two confirmations of two
  different drafts concurrently through the locked gate: both succeed and
  receive **distinct** `AIC-SO-2026-NNNN` numbers (gate 1 report). Two
  confirmations of the same draft with the same `expectedVersion`: the second
  receives a version conflict with `currentVersion`, no second number is
  allocated, and the sequence tab advances exactly once.

## Gate 4 — Lease acquisition, validation, expiry, recovery — LOCAL EVIDENCE (real logic)

- `scripts/sales-order-tests/sync-test.ts` proves the `SalesOrderSyncJobs`
  state machine on the real `src/lib/salesOrders/sync.ts`: claim assigns a
  unique lease, validation checks token + expiry, completion without the live
  token is rejected, expired `PROCESSING` leases recover to `RETRY` (the
  already-advanced attempt counter is preserved for backoff), retry schedules
  bounded exponential backoff (1s → 2s → … → capped 60s), permanent failures
  require the token, and superseded jobs are terminal.

Deployment proof (per ADR-002) still requires running the same cases against a
real Apps Script lock, because `LockService` is Google-runtime-only.
## Gate 5 — Legacy tracker column ownership — BLOCKED (safe inspection provided)

The plan's verified source analysis already established the provisional
ownership table (A:P app/sync worker, Q:S inventory, T delivery import,
U assignee projection, V fulfillment projection, W aging formula; app
technical columns appended). Locking that table requires reading the legacy
Apps Script project (scripts, triggers, web-app deployment) and the external
inventory/delivery workbooks.

Blocker: no live Google access from this environment.

Safe verification (read-only, zero writes):
`scripts/inspect-sales-order-destination.mjs` — enumerates the tracker tabs,
their first rows, formula-bearing cells for Q/T/W and the Services/ Repair
filter source, and reports every observed value. It sets quota-safe ranges,
never appends columns, never sorts, and isolates itself to reads.

## Gate 6 — Audit every legacy write path — BLOCKED

The five legacy entry paths (form button, custom menu, installable triggers,
web-app deployment, direct manual entry) cannot be enumerated without Google
Apps Script API access. The cutover gate requires that all five be disabled.

The inspection script prints the checklist of paths to verify and steps to
disable them at cutover; it does not guess their state.

## Gate 7 — Column-A compatibility review — DESIGN DONE, live verification BLOCKED

`A` currently holds legacy Tracker No. values; new rows will carry
`AIC-SO-YYYY-NNNN`. Every consumer of `A` must accept the alphanumeric form:
the Services/ Repair filter, aging rules, lookups/sorts/reports, sequence
calculations, and the original Sales Order Entry form lookups.

This review is data-dependent (drive formulas on real cells), so it is a
blocked gate. The safe verification script includes a formula-scan mode to
collect the exact formulas in the first seven tracker and service rows for
manual review, and this report records the reviewed contract:
`AIC-SO-YYYY-NNNN` (letters, hyphen, four digits, hyphen, four non-zero
suffixed digits) with an explicit compatibility test list in
`scripts/sales-order-tests/domain-test.ts` (parse/format/rollover/reject).

## Gate 8 — Stable destination line IDs for migrated rows — DESIGN READY, backfill blocked

Design (per plan §8 and ADR-002): migrated rows keep `LegacyTrackerNo` in `A`
and receive immutable `SalesOrderId`/`SalesOrderItemId` values in appended app
technical columns, reconciled through `SalesOrderImportMap` and
`SalesOrderSyncMap.DestinationRowHint`. Outbound updates for migrated orders
remain disabled until their import-map entries are reviewed and destination
line IDs are backfilled with the duplicate-reconciliation pass green.

Blocker: the import audit must run against a **frozen snapshot** of the
legacy workbook (Phase 5 dry run) before IDs can be backfilled; snapshots are
not possible yet because credentials are unavailable in this environment.

## Gate 9 — Unresolved business gates (recorded, not hidden)

| Gate | Question | Required decision |
|---|---|---|
| VAT treatment | inclusive / exclusive / exempt / zero-rated, and whether it may differ per line | Finance confirmation; meanwhile the 12% inclusive legacy convention is a documented default, and per-line `TaxMode` is already modeled |
| Discount basis | fixed-amount line discount only; header-wide discounts and shipping need an allocation policy | Business decision before any header-level discount can be enabled |
| Approval before confirmation | optional policy; not assumed | Business decision |
| Evidence for delivery/service fulfillment | DR posted vs service-completion evidence; document handover ≠ delivery | Confirm which evidence documents are mandatory per line type |
| Role permissions | role → capability mapping for sales / sales manager / operations / finance | Required before non-admin roles are granted (see `src/lib/salesOrders/permissions.ts`) |

## Evidence and verification commands

| Artifact | Command |
|---|---|
| Money (integer-cent, inclusive/exclusive/exempt) | `node scripts/sales-order-tests/run.ts` after `npx tsc -p scripts/sales-order-tests/tsconfig.json` |
| Numbering/transitions/fulfillment math | same runner (domain-test) |
| Lease lifecycle/backoff/recovery | same runner (sync-test) |
| Command envelope HMAC/auth window | same runner (protocol-test) |
| Runtime request validation | same runner (validation-test) |
| Serialization/conflict/replay | same runner (concurrency-test) |
| Repo-wide types | `npx tsc --noEmit` |
| Safe legacy inspection (read-only) | `node scripts/inspect-sales-order-destination.mjs` (no credentials → prints blocker checklist) |

## Blocker list

1. No Google account/Apps Script project connected → Gate 2 deployment proof,
   Gate 3 live serialization proof, Gate 4 live lock/lease proof blocked.
2. No live spreadsheet access → Gate 5 ownership verification, Gate 6 write
   path audit, Gate 7 live formula review, Gate 8 snapshot/backfill blocked.
3. Business input required → Gate 9 five decisions (VAT, discount, approval,
   evidence, roles).
4. ADR-002 remains **Proposed**: acceptance requires every gate above to show
   actual evidence, then a separate recorded update.

# FTI Fuel Recalculation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Automatically reprice eligible trips, refresh saved PDFs, and reject approval of unseen amounts.

**Architecture:** Google Sheets remains authoritative. A uniquely named temporary sheet provides an exclusive cross-instance FTI write lock; competing writers fail with a retryable conflict. Repricing commits price, affected cells, totals, and durable PDF-pending state in one Sheets batch. Server-rendered PDFs consume stored amounts; a daily authenticated cron plus immediate processing and automatic retries while the settings page is open drain pending work.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Google Sheets/Drive, existing @react-pdf/renderer, Node regression harnesses.

**Spec:** `docs/superpowers/specs/2026-11-14-fti-fuel-recalculation-design.md` (approved).

## Global Constraints

- Include DRAFT, SENT, SUBMITTED, REQUESTED_FOR_CHANGE, REJECTED; exclude APPROVED and unknown statuses.
- Only trip dates today or later in Asia/Manila; use current technician km/L, fallback 12.
- Preserve past rows, other expenses, identities and approval assignments.
- A PDF failure does not roll back valid amounts; preserve linked Drive file IDs.
- No deployment, commits, or further production-data changes in this implementation task.

## Review Focus

- Two app instances race: no approved FTI is repriced and no unseen amount is approved (Task 1/3).
- An old browser uploads a PDF after repricing: reject the upload before touching Drive (Task 3).
- Worker crashes or API response is lost: durable pending state survives; a retained lock fails closed, never auto-expires into overlapping writers (Task 1/2).
- Mixed dates, zero fuel, missing rate, malformed dates: preserve stored values or fail safely (Task 1/2).
- PDF retry after a second price change or approval: render current stored state, never an obsolete snapshot (Task 2/3).

## Task 1: Atomic recalculation and coordination

Files: `src/lib/ftiWriteLock.ts`, `src/lib/ftiRecalculation.ts`, `src/lib/ftiFuelPrice.ts`, `src/lib/ftiSheets.ts`, `src/types/fti.ts`, `scripts/test-fti-recalculation.cjs`.

Interfaces: `withFTIWriteLock<T>(work: () => Promise<T>): Promise<T>`, `isFTIWriteLocked(): boolean`; `recalculateFTIFuel(price: number, now?: Date)` returns affected request/trip counts and pending PDFs. `ftiRevision(full)` hashes saved approval-relevant content.

- [x] Write and run failing domain tests for cutoff, statuses, current rate, zero, rounding, totals, no-op repeat, invalid input, and revision changes.
- [x] Implement fresh snapshot planning and one atomic price/detail/total/PDF-state batch. Add L:N request metadata for PDF status, retry-at and attempts, validating existing headers before use.
- [x] Wrap all FTI mutation entry points with a reentrant cross-instance lock. Bypass local FTI caches while holding it; invalidate after mutations. Disable automatic transport retries for lock acquisition (a lost acquisition response must fail closed).
- [x] Test contention with independent lock instances, nested writes, release on failure, and retained lock after unknown acquisition outcome.
- [x] Run domain/lock tests and existing FTI submission/read-only regressions.

## Task 2: Durable PDF regeneration

Files: `src/lib/ftiPdf.tsx`, `src/lib/ftiPdfJobs.ts`, `src/app/api/fti/pdf-jobs/route.ts`, `vercel.json`, `docs/fti-fuel-recalculation-operations.md`, `scripts/test-fti-pdf-jobs.cjs`.

Interfaces: `renderFTIPdf(full, miscellaneous): Promise<Buffer>`; `queueFTIPdf(controlNo)`; `processFTIPdfJobs(limit?: number)`; `getFTIPdfJobSummary()`.

- [x] Write and run failing tests for failed uploads, durable retry, existing file reuse, missing link, and rendering latest revision after repricing/approval.
- [x] Implement the existing document's company/header, trip/expense columns, totals and signature fields in the installed server PDF renderer. Render stored subtotals, including zero; resolve stored signature data through trusted application sources.
- [x] Persist job status in the same repricing batch. Process one record at a time under the FTI lock; update the existing Drive file, clear pending only after successful upload. Retry failures with capped backoff and expose pending/failed counts. Pending links are hidden in the app until current again.
- [x] Add authenticated cron GET and manager-only POST; immediate post-response work plus page-driven retries and a daily Vercel cron at 00:00 UTC. Require CRON_SECRET; document more frequent external scheduling if desired.
- [ ] Visual PDF sign-off: sample generation and PDF job tests pass, but image inspection is blocked by Windows Application Control and unavailable browser automation. See operations guide.

## Task 3: Routes, stale approval and UI

Files: FTI fuel-price/request/PDF-upload routes; `src/lib/services/fti.service.ts`; FTI settings/page/preview components; FTI route regression scripts.

- [x] Write and run failing tests: unauthorized repricing, missing/stale revision rejected with 409 and no writes, correct revision approved, old PDF upload cannot overwrite current data.
- [x] Price PUT uses recalculation; validate before writes and return counts. Settings copy explains eligibility and displays PDF progress/failure; automatically retry pending work while open.
- [x] Return content revision in full request reads. Under the same lock, compare expected revision before approval, persist the approval and pending PDF marker together, then schedule server PDF generation. Remove client pre-approval PDF upload and destructive rollback.
- [x] On stale approval, reload preview and require a second explicit action. Show pending-PDF state and suppress obsolete file links. Protect manual PDF regeneration with the same revision and authorization checks.
- [x] Run FTI tests, TypeScript and targeted lint, then an independent code review and fix material findings. Record checks and deployment requirements.

## Operational decisions

The lock is a small hidden sheet named `_FTI_WRITE_LOCK`. Google enforces unique sheet titles, so acquisition is an atomic add-sheet operation. The owner deletes its sheet ID on completion. It has no lease expiry: a terminated owner may require manual cleanup only after all affected executions have ended. This costs availability during a rare crash but prevents a paused worker from resuming after another writer has acquired the lock. All participating deployments must be upgraded together; manual Sheets edits are outside this coordination protocol.

Use current workspace without commits to keep changes visible in the user's IDE. The explicit design approval authorizes implementation; no second plan approval is required. The one-time live correction is complete and is not repeated.

## Execution record ? November 16, 2026

Implemented in the existing workspace; no commits or deployment. All nine `npm run test:fti` scripts pass, TypeScript passes, and the production build passes. New/updated workflow modules pass targeted lint. The eight lint errors in legacy FTI files were compared against HEAD and are unchanged.

Independent review findings were fixed with regressions: linked PDFs become pending on subsequent edits, the entire legacy submission path is locked, and known read timeouts do not retain a write lock. Uncertain mutating requests retain the lock, including nested errors absorbed by a route; this requires the documented operator recovery rather than unsafe lease expiry.

A synthetic 32-trip PDF was generated successfully. Visual review and a live Sheets/Drive end-to-end rollout test are not completed. Operations and deployment instructions are in `docs/fti-fuel-recalculation-operations.md`. No additional production FTI records were modified.

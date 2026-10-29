# Liquidation Returns Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Record and view full cash-advance returns after liquidation approval.
**Architecture:** Append return metadata to Liquidations; derive status independently from approval. Save date and private Drive evidence through one multipart endpoint, and authorize each evidence read. Reuse list and dialog patterns.
**Tech Stack:** Next.js 16, React 19, TypeScript, Google Sheets/Drive.
**Spec:** docs/superpowers/specs/2026-10-27-liquidation-returns-design.md

## Global Constraints
Only the requestor edits; requestor, approver, CFO and admins view. Date and evidence required; full amount only; historical returns allowed; future dates rejected in Asia/Manila. No commit/deploy/live data changes in this task.

## Review Focus
- Existing rows with missing cash advance values use the FTI fallback consistently.
- Unrelated users, generic Drive proxies and delete routes cannot expose or remove evidence.
- Failed uploads/saves preserve the previously recorded return.
- Date-only edits retain existing evidence; replacement errors do not clear it.
- Approved balances cannot be silently edited after a return.

### Task 1: Return rules and persistence
Files: src/types/liquidation.ts, src/lib/liquidation-returns.ts, src/lib/liquidationSheets.ts, scripts/test-liquidation-returns.cjs.
Interfaces: getLiquidationReturnStatus(liquidation), getLiquidationReturnAmount(liquidation), validateReturnDate(date, now), saveLiquidationReturn(id, userId, date, evidence).
- [x] Add failing tests for date boundaries, full-balance rounding, old records, owner/approval restrictions, row gaps and evidence retention.
- [x] Implement validation, append-only P:T metadata, fresh row lookup and atomic metadata/audit write. Preserve approved financial totals.
- [x] Run node scripts/test-liquidation-returns.cjs.

### Task 2: Protected save/view API
Files: src/lib/liquidation-return-access.ts, src/lib/liquidation-return-evidence.ts, src/app/api/liquidations/returns/route.ts, src/app/api/liquidations/route.ts, src/app/api/images/drive/[fileId]/route.ts, src/lib/receiptUpload.ts.
Interfaces: multipart POST with liquidationId, returnDate, optional replacement file; GET by liquidationId streams current evidence. Existing evidence required when file omitted. Access helper resolves CFO/admin/mapped-approver context.
- [x] Test owner-only save, required evidence, invalid image, private storage, unauthorized viewing/deletion, CFO listing and legacy FTI amounts.
- [x] Implement protected Drive storage and route; enrich/redact list fields according to permissions; make approved records reachable for CFO and actual approvers including BOD.
- [x] Run return tests and existing liquidation regression tests.

### Task 3: Requestor form and visibility
Files: src/components/liquidation-return-dialog.tsx, src/components/liquidation-list.tsx, src/lib/services/liquidation.service.ts.
- [x] Add separate return status/filter and full-balance display; show record/edit/view action based on server capabilities.
- [x] Add required date, upload and camera, preview, read-only details, validation, error and saving states; refresh after success.
- [x] Run TypeScript, targeted ESLint, regression scripts and production build; inspect UI where available.
- [x] Review the complete diff and fix material findings.

## Execution notes
Implement in the current clean checkout; no commits or worktree creation required. The approved design and request to proceed authorize implementation without another approval round.

## Verification and delivery status (2026-10-29)

- Implementation complete locally; no commit or deployment performed.
- Return rules/access/persistence/API tests, existing receipt/VAT regressions, TypeScript, and targeted lint for new backend/dialog code pass.
- The existing liquidation list has two pre-existing react-hooks/set-state-in-effect errors and one pre-existing unused lint suppression; return-related list changes add no lint findings.
- Production build passed with network access on 2026-10-29, including TypeScript and all 137 pages. Restricted-network builds fail fetching the existing Google Fonts.
- Real local UI previously verified against existing records: Cash Return column/filter, calculated balances, and admin read-only details. No live return or evidence upload was saved. Requestor camera/upload interactions and an actual Drive/Sheets save remain to be checked after deployment or in a dedicated test environment.
- Browser access was unavailable when resuming on 2026-10-29.

## Review resolution

- Important: unresolved legacy FTI links must not break the complete list. Fixed with an explicit unavailable-amount flag, blocking only recording that specific return; covered by a red-to-green mixed-record regression test.
- The review's generic-error concern is covered by the existing Axios response interceptor, which converts server error text to Error.message before the dialog receives it.
- The deciding approver is retained for future view access, including BOD overrides; current configured approvers retain access through mappings.
- Evidence uses private OAuth My Drive files. Replaced uploads are retained; uncertain Sheets failures also retain new uploads to avoid deleting evidence for a write that may have committed.
- The first real return save initializes P:T headers and grows the sheet if needed, with a conflict check to avoid overwriting differently named columns. No manual migration or new environment variables are required.

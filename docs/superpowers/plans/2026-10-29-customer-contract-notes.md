# Customer Contract Notes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add readiness badges and independently dated, editable, deletable contract notes.

**Architecture:** Keep the existing Next.js/Google Sheets architecture. Store notes in ContractNotes; hydrate contract responses with note history. Use atomic Sheets batch requests for initial notes and legacy migration.

**Tech Stack:** Next.js 16, React 19, TypeScript, Google Sheets API, existing shadcn components.

**Spec:** docs/superpowers/specs/2026-10-29-customer-contract-notes-design.md

## Global Constraints

No new dependencies. Preserve old notes without inventing dates. Server-generated UTC timestamps; local display with timezone. No live data writes, commits, or deployment in this implementation session.

## Review Focus

- Legacy migration retries must not duplicate or discard existing notes.
- Note edits preserve createdAt, including undated legacy notes.
- Missing authentication, contracts, and mismatched note ownership prevent writes.
- Contract form changes must not replace history; initial notes save with the parent.
- Clearing note rows must not shift other notes during subsequent writes.

### Task 1: Notes persistence and API

**Files:** src/types/contract.ts, src/lib/contractNotes.ts, src/lib/contractNoteSheets.ts, src/lib/contractSheets.ts, src/app/api/contracts/[id]/notes/route.ts, src/app/api/contracts/[id]/notes/[noteId]/route.ts, scripts/setup-contract-notes.cjs, scripts/test-contract-notes.cjs.

**Interfaces:** ContractNote { id, contractId, text, createdAt?, updatedAt? }; Contract.noteHistory; getContractNotes(), addContractNote(contractId,text), updateContractNote(contractId,noteId,text), deleteContractNote(contractId,noteId), setupContractNotes(apply).

- [x] Write and run failing tests for note creation, edits, deletion, legacy migration retries, validation, authentication, and ownership.
- [x] Implement worksheet schema, dry-run/apply setup, notes CRUD, and authenticated nested routes. Preserve row positions with ID-only markers for deleted notes.
- [x] Hydrate contract history and atomically save initial notes with new contracts. Reject obsolete notes updates; cascade note removal on contract deletion.
- [x] Run note tests and existing contract tests; expect all pass.

### Task 2: Badges and note history UI

**Files:** src/lib/contractStatus.ts, src/lib/services/contract.service.ts, src/components/contract-note-history.tsx, src/app/dashboard/customer-contracts/page.tsx, scripts/test-contract-notes.cjs.

**Interfaces:** contractReady(contract,today); contractService.addNote/updateNote/deleteNote; ContractNoteHistory renders notes with optional edit/delete callbacks.

- [x] Add failing tests for readiness combinations, expiry, history ordering, and date rendering.
- [x] Implement wrapped company badges, note history dialog with add/edit/delete confirmation and retained drafts on failure, table previews, details, initial-note form, and dated Excel export.
- [x] Run focused tests, TypeScript, and lint on changed files; inspect the rendered component and page if local runtime permits. React rendering is tested; browser verification was blocked by the Computer Use URL check.

### Task 3: Delivery checks

- [x] Review the diff against the design, fix in-scope issues, and rerun affected checks.
- [x] Document deployment: run the dry-run setup, apply with contract writes paused, verify readback, then deploy. Do not run live setup during this session.
- [x] Report verification and limits with file links in the delivery response and docs/customer-contract-notes.md.

## Execution record

User approved implementation on 2026-10-29. Execute inline without another approval gate. Work in the provided checkout; no git mutations are authorized and .git is read-only in this sandbox. Skills' commit/worktree steps are therefore omitted. Plan interfaces reviewed: task 2 consumes task 1's ContractNote/noteHistory and nested API routes; no conflicts.

Independent review found a cross-note race when an emptied tail row was reused by appendCells. Added deterministic stale-update and stale-delete interleaving regressions, watched them fail, then fixed individual and cascade deletion to retain ID-only row markers. The reviewer confirmed the fix. Same-note concurrent edits retain the application's existing last-write behavior.

Production build passed after retrying with network permission for the existing Google Fonts dependency. TypeScript, focused lint, and contract tests passed. Live migration/deployment and interactive browser checks remain outside the verified results.

# Bulk upload scans: multiple PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Bulk upload scans dialog take several PDFs at once, add more later, and hold back already-scanned invoices unless Replace is ticked.

**Architecture:** One `analyzeScannedPdf` run per file. The dialog keeps the loaded files in a ref keyed by file id, and rows carry `fileId`. The held-back rule is a pure function in `scannedInvoiceBatch.ts`.

**Tech Stack:** Next.js client component, React state, plain Node test script (`scripts/test-scanned-invoice-batch.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-27-bulk-scan-multi-file-design.md`

## Global Constraints

- No server, route, or per-row upload icon changes. Sales Invoices are untouched.
- Unticked "Already scanned" rows are left out of Save all. They never block it.
- `replaces_scan` label text: "Already scanned".

## Review Focus

- Adding more PDFs while earlier rows are edited or saved: existing rows keep their state.
- An already-scanned invoice whose badge reads "Check number" or "Not active" is still held back.
- A held-back row with the same number as a pending row doesn't cause a Duplicate block.
- A mixed selection with a non-PDF or an unreadable PDF: the other files still load.
- Closing the dialog disposes every loaded file's object URLs.

---

### Task 1: Held-back rule

**Files:** Modify `src/lib/scannedInvoiceBatch.ts`, `scripts/test-scanned-invoice-batch.cjs`

**Produces:** `isHeldBack(invoice: BatchInvoiceInfo | undefined, replace: boolean): boolean`

- [ ] Add tests:
  - `isHeldBack(info({hasScan:true}), false) === true`
  - `isHeldBack(info({hasScan:true}), true) === false`
  - `isHeldBack(info(), false) === false`
  - `isHeldBack(undefined, false) === false`
- [ ] Run `node scripts/test-scanned-invoice-batch.cjs`. Expected: it fails with "not a function".
- [ ] Implement `isHeldBack` as `Boolean(invoice?.hasScan) && !replace`.
- [ ] Run the script again. Expected: `scanned invoice batch rules: ok`.

### Task 2: Dialog takes several files and holds back re-uploads

**Files:** Modify `src/components/bulk-scan-upload-dialog.tsx`

**Consumes:** `isHeldBack` from Task 1.

- [ ] `BatchRow` gains `fileId: number`, `fileName: string` and `replace: boolean`.
- [ ] Loaded files live in `filesRef: Map<number, { extractPage, dispose }>`. `reset` disposes them all.
- [ ] `handleFiles(files: File[])`:
  - Non-PDFs are dropped with a toast.
  - Each PDF is read one after another, and progress tracks `{ file, files, done, total }`.
  - A failed file shows a toast with its name and the next file continues.
  - Rows are appended after each file is read.
- [ ] The input is `multiple`. Once rows exist, the footer button reads "Add more PDFs" and opens the same input. The Page column shows `fileName · p<n>`, and the row key is `${fileId}-${pageIndex}`.
- [ ] Held-back rows (`isHeldBack(info, row.replace) && saveState !== "saved"`):
  - are excluded from `pendingIndexes` and from duplicate detection
  - show the "Already scanned" badge.
- [ ] Replace? column: a checkbox shows only when `info?.hasScan`. It's disabled while locked.
- [ ] The footer says "N already scanned — tick Replace to re-upload." when N > 0 and nothing is blocked.
- [ ] `npx tsc --noEmit`, `npx eslint src/components/bulk-scan-upload-dialog.tsx src/lib/scannedInvoiceBatch.ts` and `npm run build` all pass.
- [ ] Commit.

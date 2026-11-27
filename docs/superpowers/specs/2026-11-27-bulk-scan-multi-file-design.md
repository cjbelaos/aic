# Bulk upload scans: multiple PDFs and opt-in re-uploads — design

Date: 2026-11-27 · Size: small change · Builds on [2026-11-25-bulk-scanned-si-upload-design.md](2026-11-25-bulk-scanned-si-upload-design.md)

## Why

Some scans come out as one PDF per invoice instead of one batch PDF. The bulk dialog takes one PDF,
so those still go through one at a time. Chris wants to pick many PDFs at once, mixing batch PDFs and
single-invoice PDFs, and check and save them together. Separately, invoices that already have a
scanned copy should not be overwritten unless Chris deliberately marks them.

## Goals

- The file picker in **Bulk upload scans** accepts multiple PDFs (Ctrl/Shift-click). Batch and
  single-page PDFs can be mixed.
- After the first pick, the button becomes **Add more PDFs**. New pages are appended to the rows already
  on screen. Edits, skips and saved rows stay as they are.
- Each row shows which file and page it came from (`<file name> · p<n>`).
- Rows whose invoice already has a scanned copy are labeled **Already scanned** and have a
  **Replace?** tickbox, unticked by default. Unticked rows are left out of **Save all** and its count.
  A ticked row is saved and replaces the old scan.

## Non-goals

- No change to the per-row upload icon in the invoices table, to Sales Invoices, to the server route, or
  to number reading.
- Save all is not blocked by undecided "Already scanned" rows. They are simply left out.

## Anti-goal

A page attached to the wrong invoice, or an existing scan overwritten, without anyone noticing.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **1 (chosen)** | Each file keeps its own reader. `analyzeScannedPdf` runs once per file, unchanged. The dialog keeps a list of loaded files (`{ id, name, extractPage, dispose }`), and each row carries its file id. | A bit more state in the dialog. Supports "add more" and per-file labels cleanly. |
| 2 | Merge the selected PDFs into one with `pdf-lib`, then run the existing flow. | Smaller change, but file names are lost, and "add more" means re-merging and re-reading everything. |

## Design

- **[bulk-scan-upload-dialog.tsx](../../../src/components/bulk-scan-upload-dialog.tsx):**
  - The `<input>` gets `multiple`.
  - `handleFile` becomes `handleFiles(FileList)`. It reads PDFs one after another, without resetting
    existing rows, and appends rows as each file finishes.
  - Progress reads "File 2 of 5 · page 3 of 9".
  - `BatchRow` gains `fileId`, `fileName` and `replace: boolean`.
  - Row keys become `${fileId}-${pageIndex}`.
  - `saveRow` uses the extractor for that row's file.
  - `reset` disposes every loaded file.
- **Held back:** a row is held back when its invoice `hasScan` and `replace` is false. Held-back rows:
  - are excluded from `pendingIndexes`, so they don't count toward Save all or blocking
  - are excluded from duplicate detection, the same way skipped rows are.
- **Pure logic:** the held-back rule lives in
  [scannedInvoiceBatch.ts](../../../src/lib/scannedInvoiceBatch.ts) (for example
  `isHeldBack(info, replace)`), with unit tests. The `replaces_scan` label becomes "Already scanned".
  The Replace? tickbox shows only on rows whose invoice has a scan.
- **Footer:** shows "N already scanned. Tick Replace to re-upload." when any rows are held back.

## Builder's calls (open to correction)

- Duplicate detection covers every non-skipped, non-held-back row across all files.
- The held-back check uses the invoice's `hasScan` directly, not the status badge. That way a row
  showing "Check number" or "Not active" for an already-scanned invoice is still held back.
- Non-PDF files in a selection are ignored with a toast. A PDF that fails to read is reported by name,
  and the other files still load.
- The same file can be picked twice. Its pages show up as duplicates and get caught by duplicate
  detection, so there's no extra file-name check.
- The dialog description is updated to say several PDFs can be picked.

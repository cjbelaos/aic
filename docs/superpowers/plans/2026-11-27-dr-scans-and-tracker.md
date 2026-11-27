# Scanned DRs and tracker auto-return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bulk/single DR scan upload on Delivery Release. Every SI/DR scan returns its Document Tracker entry. DR scans complete the DR.

**Architecture:** A `ScanProfile` drives one shared reader and dialog. The server upload routes record the scan, then run the tracker step and the DR status step. These steps never undo a saved scan.

**Tech Stack:** Next.js route handlers, Google Sheets/Drive, pdfjs/tesseract/pdf-lib in the browser, plain Node test scripts.

**Spec:** `docs/superpowers/specs/2026-11-27-dr-scans-and-tracker-design.md`

## Global Constraints

- DR folder `1sya8h4vz1kuvCtuhcvO7PCoB0jZ0vxlB`, with a subfolder named after the year of the DR delivery date.
- DeliveryReceipts AB:AD = ScannedFileLink, ScannedAt, ScannedBy.
- Tracker auto-return only when the uploader can receive *and* verify. Its failure → `trackerWarning`, and the scan is kept.
- A DR goes to completed only from created/printed. Its failure → `statusWarning`.
- Sales Invoices are untouched.

## Review Focus

- The SI sample still reads 9/9 after the reader is made profile-driven.
- A DR scan for a cancelled or draft DR: the scan is saved and the status is unchanged.
- An uploader without receive/verify rights: the scan is saved, the tracker is unchanged, and a warning is shown.
- A tracker entry already returned or unassigned is not rewritten.
- A year folder that's missing is created once, not duplicated per page within a batch. Uploads are sequential.

---

### Task 1: Profiles and dark-ink reading
**Files:** `src/lib/scannedInvoiceBatch.ts`, `src/lib/scannedInvoiceBatchPdf.ts`, `src/lib/scannedInvoicePageExtractor.ts`, `scripts/test-scanned-invoice-batch.cjs`, `scripts/verify-scanned-batch-sample.mjs`

**Produces:**
- `ScanProfile`, `SERVICE_INVOICE_PROFILE` and `DELIVERY_RECEIPT_PROFILE`
- `darkInkMask(data)` and `inkMask(profile, data)`
- `rowStatus(..., uncertain, inactiveStatuses?)`
- `analyzeScannedPdf(file, profile, onProgress)`
- `createPageExtractor(bytes, prefix = "SI")`

- [ ] Tests:
  - `darkInkMask` turns dark pixels black and light pixels white.
  - `rowStatus` with DR inactive statuses gives `inactive` for `cancelled`.
  - The extractor with prefix `DR` names the file `DR 4030.pdf`.
- [ ] Tune the DR crop. Run `node scripts/verify-scanned-batch-sample.mjs <DR sample> <expected> dr` until it reads 18/18. Run the SI sample: it must read 9/9.

### Task 2: Tracker auto-return
**Files:** `src/lib/documentHandoverSheets.ts` and a new pure `src/lib/documentScanReturn.ts`, plus tests.

**Produces:**
- `scanReturnPlan(existingStatus | undefined)` → `"return_both" | "verify_only" | "create" | "skip"`
- `returnDocumentFromScan({documentType, documentNumber, customerName, actorId, actorName})` → outcome
- `canAutoReturnDocuments(session)`

### Task 3: SI route uses tracker step
**Files:** `src/app/api/service-invoices/upload-scanned/route.ts`, `src/lib/services/service-invoice.service.ts`. Returns `trackerWarning`.

### Task 4: DR storage, route, completion
**Files:**
- `src/lib/deliverySheets.ts`: range to AD, summary fields, `recordDeliveryReceiptScan`, `completeDeliveryReceiptFromScan`
- `src/types/deliveryReceipt.ts`
- `src/lib/googleSheets.ts`: export `findOrCreateDriveFolder`
- new `src/app/api/deliveries/upload-scanned/route.ts`
- `src/lib/services/delivery.service.ts`

### Task 5: Shared dialog and DR page
**Files:** `src/components/bulk-scan-upload-dialog.tsx`, the SI client wiring, `src/app/dashboard/delivery-releases/page.tsx`
- The dialog takes `profile`, `title`, `numberLabel`, `records` and `upload`.
- Warnings show on saved rows.
- The DR page gets the Scanned copy column with a per-row upload, and the Bulk upload button.
- [ ] `tsc`, eslint, both test scripts and `next build` pass. Commit, merge, push.

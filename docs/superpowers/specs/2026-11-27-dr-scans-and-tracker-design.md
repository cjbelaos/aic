# Scanned DRs and automatic Document Tracker returns — design

Date: 2026-11-27 · Size: project · Builds on
[2026-11-25-bulk-scanned-si-upload-design.md](2026-11-25-bulk-scanned-si-upload-design.md) and
[2026-11-27-bulk-scan-multi-file-design.md](2026-11-27-bulk-scan-multi-file-design.md)

## Why

Signed Delivery Receipts come back from technicians, and Chris scans them in batches, the same way
he scans Service Invoices. Today a DR has no scanned copy in the system. Its tracker entry also has
to be received and verified by hand on the Document Tracker page, and the same is true for Service
Invoices. Chris wants:

1. to bulk upload scanned DRs from the Delivery Release page, the same way as Service Invoices, and
2. every saved scan, SI or DR, to mark that document as received and verified in the Document
   Tracker.

Chris (`cjbelaos`, user id `bb71f1fb-daba-47d6-b70e-5b5bff3339ba`) is the super admin and the After
Sales document receiver. He can already receive and verify documents. Service Invoices, with or
without a DR, are assigned to him in the tracker. DRs are usually assigned to the technician who
delivered them.

## Goals

**A. Scanned DRs (Delivery Release page)**
- New **Scanned copy** column. It shows "Scanned" as a link to the scan, or "Not scanned", plus an
  upload icon on each row for single scans.
- **Bulk upload scans** button in the page header. It opens the same dialog as Service Invoices:
  several PDFs at once, Add more PDFs, Already scanned / Replace?, Skip, the check screen, and
  Save all.
- The DR number is read from the black `DR ####` printed at the top right of the generated DR form.
  On the check screen, the System column shows the customer, the delivery date and the DR status.
- Scans are saved to Drive folder `1sya8h4vz1kuvCtuhcvO7PCoB0jZ0vxlB`, in a subfolder per year
  (`2026`, …) based on **the DR's delivery date**. The year folder is created if it doesn't exist.
- Each split page is named `DR <number>.pdf`.

**B. Tracker auto-return (SI and DR, single and bulk uploads)**
- After a scan is saved, the upload route updates the tracker entry with the matching
  `documentType` (`service_invoice` / `delivery_receipt`) and number:
  - *Handed over* → *Returned* (verified). Both the received (P:R) and verified (S:U) audit
    columns are set to the uploader and the upload time.
  - *Received by After Sales* → *Returned*. Only the verified columns (S:U) are set.
  - *Returned* or *Unassigned* → no change.
  - **No entry** → a new entry is created already *Returned*. Assignee is the uploader,
    received and verified are the uploader, and the note is "Created from scanned copy upload".
- This only happens when the uploader can both receive and verify. Today that is
  `isAfterSalesDocumentReceiver || canReceiveAndVerifyDocuments` for receiving, and
  `isAdminUser || canReceiveAndVerifyDocuments` for verifying. Anyone else's scan still saves, and
  the tracker is left alone.
- A tracker failure never undoes the scan. The route returns `trackerWarning`, the single upload
  shows it as a toast, and the bulk row shows "Saved · tracker not updated" with the reason.

## Non-goals

- Sales Invoices: no change, including their scans and tracker entries.
- Moving or renaming existing DR PDFs (`driveFileLink`, column L).
- Changing who may receive or verify on the Document Tracker page itself.
- Reading numbers with an AI service.

## Anti-goals

- A scan attached to the wrong DR or SI without anyone noticing. The check screen rules stay:
  unread, not found and duplicate block saving, and already scanned is held back until Replace is
  ticked.
- A tracker entry marked returned by someone who isn't allowed to return it.
- A failed tracker update losing a scan that was already saved.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **1 (chosen)** | One dialog and one reader, driven by a per-document **profile** (number crop, ink mode red/dark, file prefix, labels, inactive statuses). The SI and DR pages each pass their profile, their record lookup and their upload function. | Small rework of the existing dialog. SI and DR stay identical, and every fix lands in both. |
| 2 | Copy the dialog and reader for DRs. | Leaves the SI code untouched, but two screens drift apart and fixes are made twice. |

Tracker placement: the update runs **on the server inside each upload route**, after the scan is
recorded. It does not run as a separate client call, so single and bulk uploads behave the same and
the permission check can't be skipped by the browser.

## Design

### Reader profile
`src/lib/scannedInvoiceBatch.ts` gains a `ScanProfile` type:
`{ crop: {x0,y0,x1,y1}, ink: "red" | "dark", filePrefix: "SI" | "DR", inactiveStatuses: string[] }`.
It also gains:
- `SERVICE_INVOICE_PROFILE`: today's values (`NUMBER_CROP`, red, `SI`, draft/cancelled/void).
- `DELIVERY_RECEIPT_PROFILE`:
  - The crop covers the `DR ####` line. Initial estimate x 0.80–0.96, y 0.065–0.10, to be tuned on
    the sample.
  - Ink is dark (pixels with all channels below ~110 → black, everything else white).
  - Prefix `DR`.
  - Inactive statuses: draft, pending_approval, rejected, cancelled, deleted.
- `darkInkMask(data)`, which works like `redInkMask`.

`pickInvoiceNumber` already ignores the letters "DR", because the whitelist is digits only.

`analyzeScannedPdf(file, profile, onProgress)` and `createPageExtractor` get the profile's crop,
mask and file prefix. `rowStatus` takes the inactive statuses from the profile.

### Dialog
`BulkScanUploadDialog` becomes document-neutral. It receives:
- `profile: ScanProfile`
- `title` / `description` / `numberLabel` ("Invoice No." / "DR No.")
- `records: Map<string, BatchInvoiceInfo>`, built by the page. For DRs: customer = `companyName`,
  `total` replaced by a date line, so `BatchInvoiceInfo` gets an optional `detail` string the
  System column shows (SI: `₱18,000.00 · created`, DR: `2026-11-10 · completed`).
- `upload(number, file) → { fileLink, trackerWarning? }`

A row whose upload returned `trackerWarning` shows the Saved badge plus a small amber
"tracker not updated" note, with the reason in its tooltip.

### DR storage
DeliveryReceipts gets new columns **AB:AD**: `ScannedFileLink`, `ScannedAt`, `ScannedBy`.
- `DELIVERY_RECEIPTS_RANGE` widens to `A2:AD`.
- `DeliveryReceiptSummary` gains `scannedFileLink?`, `scannedAt?` and `scannedBy?`.
- A new `recordDeliveryReceiptScan(drNumber, fileLink, userId)` writes AB:AD only.

Existing writers of A:S and T:W are unaffected.

### DR upload route
`POST /api/deliveries/upload-scanned` mirrors the SI route:
- multipart `file` + `drNumber`, authenticated
- PDF/JPEG/PNG/WebP up to 10 MB
- 404 if the DR is missing
- uploads to `<DR folder>/<year of DR date>/` via `findOrCreateFolder` (refactored out of
  `resolveDriveFolderPath`, or a sibling helper)
- sets anyone-with-link read access, records AB:AD, then runs the tracker step

Client: `deliveryService.uploadScanned(drNumber, file)`.

### Tracker step
New `returnDocumentFromScan({ documentType, documentNumber, customerName, actor })` in
`documentHandoverSheets.ts`. It returns `{ outcome: "returned" | "already_returned" | "unassigned" |
"created" | "not_permitted" }` and applies the rules in Goal B, reading the sheet once and writing
with one `batchUpdate` (or one `append` for a new entry). Both upload routes call it in a
`try/catch` and add `trackerWarning` to the response on failure or `not_permitted`.

## Verification

- Pure tests (`scripts/test-scanned-invoice-batch.cjs`):
  - `darkInkMask`
  - profile-driven `rowStatus` (DR inactive statuses)
  - the tracker transition table, as a pure `scanReturnPlan(existing, actor)` helper
- The DR crop and mask are tuned against `Scan2026-11-25_103330.pdf` (18 pages). Expected:
  4030, 4028, 4027, 4025, 4026, 3908, 4031, 4087, 4052, 4029, 4051, 4015, 4066, 4069, 4055,
  4059, 4088, 4089. The SI sample (`Scan2026-11-25_102818.pdf`) must still read all 9.
- Check that the Drive upload account can add files to the DR folder.
- `tsc`, eslint and `next build` pass.

## Builder's calls (open to correction)

- The year comes from the DR's delivery date, not the upload date, so a late-scanned December DR
  lands in that year's folder.
- New tracker entries for documents with no entry are assigned to the uploader, with the note
  "Created from scanned copy upload".
- The DR **Scanned copy** column sits next to the existing PDF link actions, and the upload icon
  shows on every row except drafts.
- Uploading a scan is taken as confirming that the scan carries the signature. The app does not
  detect signatures; you confirm it on the check screen.

### DR → Completed (decided by Chris, 2026-11-27)
After a DR scan is recorded, the route moves the DR to **completed** when its current status is
`created` or `printed`. It writes K (status), N:O (UpdatedBy, UpdatedDate) and appends a
`DeliveryReceiptStatusHistory` row (`old → completed`, uploader, time), the same way as
`updateDeliveryReceipt`.
- Any other status (draft, pending_approval, rejected, cancelled, deleted, completed) is left
  unchanged.
- Created, printed and completed are all stock-counted statuses (only `HELD_DR_STATUSES` are
  excluded), so stock and fulfillment don't move.
- This runs for single and bulk DR uploads, whoever uploads, because it's the DR's own state and
  not a tracker permission.
- If it fails, the scan is kept and `statusWarning` is returned, shown like `trackerWarning`.
- The DR check screen's System line shows the current status, so you can see which DRs will
  become completed.

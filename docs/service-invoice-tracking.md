# Service Invoice tracking

No new Google Sheet tabs or columns are needed. Tracking fields reuse the existing `ServiceInvoices!T` (`ManualCompletionData`) JSON cell. Existing manual service completion, category and corrected-copy fields are preserved.

- Column I continues to store the invoice lifecycle: draft, created, cancelled or void.
- Existing `paid` values are displayed as Created with Fully paid payment status. They migrate to Created when edited; the full payment label is retained in T.
- Payment labels (`unpaid`, `partial`, `full`) are manually maintained by admins. Changes retain previous/new labels, actor and timestamp in `paymentHistory`. This is not a payment ledger and does not calculate collections or balances.
- Newly uploaded scans store `scannedFileLink`, `scannedBy` and `scannedAt` in T, and keep their link in J for compatibility. Legacy files named `SI-SCANNED_*` are recognized as scans; generated `SI-*` PDFs do not count. Unverifiable old attachments show a notice and can be confirmed by uploading the physical scan.
- Cancellation creates a linked corrected draft. Voiding creates no replacement. Both require a reason, recorded with the actor and timestamp. Invoices marked partially or fully paid cannot be cancelled, voided or deleted until an admin reconciles their payment label.
- Creation and preview do not generate an individual invoice PDF. Automatic regeneration is disabled to protect physical scan evidence. Excel/PDF report exports remain available.

Before relying on payment filters, reconcile existing Created invoices against the legacy payment sheet using the app's admin Update payment action. Existing Created invoices default to Unpaid; existing Paid invoices default to Fully paid. Do not replace the JSON metadata with a plain payment label.

Verification: `node scripts/test-service-invoice-tracking.cjs`, `node scripts/test-service-invoice-reporting.cjs`, `node scripts/test-service-invoice-category.cjs`.

## Accounting tracker sync

Service Invoices **1801 and later** are copied to the accountants' **INVOICE AND PAYMENT TRACKER → Service Invoice** tab (`src/lib/serviceInvoiceTracker/`). Design: `docs/superpowers/specs/2026-11-23-service-invoice-tracker-sync-design.md`.

- **Columns written:** A Category (`Contracted` when the invoice has a ContractId, else `Service`), B PO No., C Date, E Customer, H Description (linked Sales Order's active lines; otherwise every invoice line), J Total. D is written only on newly appended rows. F/G lookup formulas and columns I, K onward are never written.
- **Cancelled, void and deleted** invoices: B = `CANCELLED`, A and J blank.
- **When:** automatically after create, edit, corrected copy and delete (`after()` in the service-invoice routes), plus the admin **Sync to tracker** button, which reports added, updated, unchanged, need review and failed. Drafts are never copied.
- **Need review:** the row was filled or edited by hand, has a duplicate invoice number, or holds a formula or manual TIN/address. The app never overwrites it. Fix the row in the sheet (or clear it), then press the button.
- **Not on tracker** badge: the automatic copy failed (`trackerSync.status = "failed"` in ServiceInvoices col T). Press the button to retry.
- **Customers:** the tracker's Client Directory is an IMPORTRANGE of SALES ORDER TRACKER → Client Directory. Missing customers are appended **there** (name, TIN, address), never to the tracker's copy. The import stops at row 500, and new customers past that are reported as need review.
- One-time: `node --env-file=.env.local scripts/seed-tracker-spoiled-1811.cjs [--apply]` marks spoiled paper 1811 as CANCELLED.

Verification: `npm run test:service-invoice-tracker`.

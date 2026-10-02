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

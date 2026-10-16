# Proforma Invoices

The register is at `/dashboard/proforma-invoices`, under Sales & Collections. Sales Order details also show linked proformas and a New Proforma action.

## Behavior

- One Sales Order per proforma; multiple partial proformas are allowed. Creating a proforma is optional.
- Drafts have stable IDs but no permanent number. Issuing assigns `AIC-PFI-000-020` onward; the six-digit sequence rolls from `000-999` to `001-000` and never resets by year. Cancelled numbers are retained.
- All eligible active SO lines default into the draft. Product Name is printed; service lines without a product name fall back to their description. Quantities, names, units and prices are editable; lines can be removed and manual lines added.
- VAT-inclusive payable prices are retained (VAT-exclusive SO unit prices are converted to payable prices). Linked lines inherit proportional SO discounts. Manual additions receive no inherited discount. No VAT/withholding breakdown appears on the proforma.
- Issuing and editing revalidate current SO prices/discount links and block combined issued, non-cancelled proforma totals above the SO grand total. Drafts and cancelled proformas do not consume the limit. Issued proformas can be edited while keeping their number and original Sales Order; cancelled records cannot be edited. An edited issued invoice must have its PDF regenerated and scan reattached because the old links are cleared (existing Drive files are retained).
- Notes are editable even after issuance and are internal only. Remarks are printed. DR number is optional manual text; PO, SO and legacy TR references come from the SO.
- Prepared By uses the signed-in user's name and existing signature lookup. The printable uses the shared DR A4 shell, with a two-signature Prepared By / Received By section. Totals, remarks and signatures are grouped at the end. PDF export measures rows and repeats headers on continuation pages.
- No proforma payment ledger or fulfillment postings are created. Payments and collections remain on Sales Orders.

## Storage and tracker sync

`ProformaInvoices` is the application database tab, using the exact 28-column contract in `src/lib/proforma/repository.ts`. Items are stored in `ItemsJSON`. The former SyncError column is removed by the backed-up schema migration; the reader accepts both layouts during transition. No existing Sales/Service Invoice schemas are modified.

The source is `INVOICE AND PAYMENT TRACKER` / `Order w/o Invoice`, spreadsheet `1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A`, sheet ID `1156547389`. Optional overrides: `PROFORMA_SOURCE_SPREADSHEET_ID`, `PROFORMA_SOURCE_SHEET_ID`.

New issued proformas update the matching source number, e.g. `PFI-020` already present at row 16. They write only A:D, G:H and Q (remarks); E/F lookup formulas, customer validation, and I:P / R:T payment, collection and aging cells are preserved. Dates are numeric Sheets dates. Native row metadata and strict customer-directory validation are checked before writing. Missing E/F formulas can be copied from the existing row-15 exemplar. Edits verify the source still matches the previous saved projection (or the new projection after a lost response). Cancellation marks app-owned source remarks; migration records never modify their historical source rows. Internal Notes and files remain app-only fields.

There is no manual Sync or Retry Sync action. Issuance, issued edits, and cancellations write the source as part of Save. Validation or source-write failure blocks the app save and returns an error; a failed issuance leaves no newly numbered app invoice. The form retains the user's input for another save. Drafts remain app-only until issuance; clicking Issue uses one request without first saving an intermediate draft.

The source batch is written first, followed by the app record. A lost source response is reconciled by reading the projected cells. If the app write fails, its readback first checks whether it actually committed; otherwise the original source cell values are restored without touching payment columns. The two spreadsheets do not support a shared atomic transaction: if connectivity prevents readback/restoration, the API reports an uncertain outcome and instructs the user to reload/check records rather than claiming success or a completed rollback. A unique hidden `__ProformaWriteLock` sheet serializes proforma mutations across server instances through Sheets' atomic unique-title check. If a process dies while holding the lock, an administrator must inspect the records and remove that orphaned lock sheet before retrying. Locks are never stolen automatically.

PDFs and scans use the existing OAuth Drive upload client. `PROFORMA_DRIVE_FOLDER_ID` optionally selects an existing folder; otherwise the app finds/creates `Proforma Invoices` in the connected upload account's root. Files are private under the account's existing sharing rules. The UI offers download PDF, save PDF to Drive, and scan upload. Files require an issued invoice and current version.

## Migration

`npm run audit:proforma-migration` is read-only. `npm run migrate:proforma-invoices` applies the additive import. Scripts use `.env.local`, the app's normal Sheets credentials, and no source writes. Before applying, they save a local backup, check the source hash, and acquire the same cross-instance lock. They verify every written record and confirm the source hash did not change.

The initial import contains 13 populated records, PFI-007 through PFI-019, including the duplicate-number correction: TR 1192's PFI-012 becomes **AIC-PFI-000-014 in the app only**. TR 1253 remains AIC-PFI-000-012. Empty placeholders are skipped. IDs are deterministic from original source row, making reruns idempotent. The next number is AIC-PFI-000-020.

The 13 historical TRs are absent from the current SO database. Per the user's decision, their original TRs are retained for later linking; missing links are visibly flagged. The old tracker has combined descriptions and totals without quantities or unit prices. Migration preserves each as one aggregate legacy line, rather than inventing a product-level price breakdown. Original descriptions, dates, customer snapshots, totals, remarks and provenance are retained; payment/collection data is excluded.

Reports: `tmp/proforma-migration-plan.json`, `tmp/proforma-migration-result.json`; backups: `tmp/proforma-migration-backup-*.json` (contain business data; do not commit them). To undo only the initial import before any new app writes, restore the backup's existing proforma rows or remove the newly added tab after checking no newer records exist. Never roll back by changing the source tracker.

## Verification

`npm run test:proforma-invoices` checks numbering rollover, partial discounts, order limits, manual lines, draft/issue/edit/cancel behavior, source failure blocking, lost-response reconciliation, source restoration on app-write failure, legacy migration, source placeholder selection, payment/formula preservation, and internal-note print exclusion. Also run `npx tsc --noEmit` and targeted ESLint for the changed files. Browser verification covers default SO items, edits/removals/manual additions, migrated previews, and the printable layout.

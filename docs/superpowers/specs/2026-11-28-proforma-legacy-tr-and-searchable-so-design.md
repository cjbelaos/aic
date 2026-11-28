# Proforma Invoices: legacy SO / TR mode and searchable Sales Order picker

Date: 2026-11-28 · Size: small–medium · Status: awaiting approval

## Intent

Admins need to issue a proforma for a legacy Sales Order / TR that exists only in the
SALES ORDER TRACKER spreadsheet (first case: Tracker No. 1318), not in the app's Sales Order
database. Separately, picking a Sales Order on the Proforma form should use the same
searchable picker as Deliveries and Sales Invoices.

## Settled (from the conversation)

- **VAT is unchanged.** Proformas keep VAT-inclusive prices and hide only the VAT computation
  (₱112,000 SO → ₱112,000 proforma). No pricing or limit logic changes.
- **Legacy line items are typed by hand.** Legacy products may not match the system catalogue,
  so nothing is pulled from the SALES ORDER TRACKER.
- **Legacy mode is admin-only.**
- **Approach A** (below).

## Approaches

- **A. Reuse the existing record, no schema change — chosen.** A legacy proforma is a record with
  an empty `salesOrderId` and a typed `trNo`, which is how the 13 migrated proformas already look.
  The existing 28-column `ProformaInvoices` contract is untouched. Chosen because it needs no
  live-sheet migration and reuses numbering, tracker sync, locking, PDF and scan handling.
- **B. Add a "Reference Type" column.** Explicit, but changes the fixed column contract and needs a
  backed-up migration of the live tab for a distinction the data already expresses.
- **C. Separate legacy form and endpoint.** Isolates SO logic but duplicates numbering, tracker
  sync, the write lock and file handling.

## Design

### 1. Searchable Sales Order picker
Replace the "Find Sales Order" input + native `<select>` in
`src/app/dashboard/proforma-invoices/page.tsx` with `SearchableSelect`
(`src/components/ui/searchable-select.tsx`). Option label: `SO No. · TR <tr or —> · Customer`.
Disabled for issued proformas, as today. Selection still calls `selectOrder`.

### 2. Reference type (admins only)
- The form shows a **Sales Order / Legacy SO / TR Number** choice to admins, reusing
  `InvoiceReferenceTypeSelector` wording from Sales Invoices. Non-admins see only the Sales Order
  flow. The page needs `isAdmin` from the session (server wrapper, same pattern as
  `sales-invoices/page.tsx`).
- Switching mode clears the other mode's values and the line items.
- The mode is fixed once the proforma is issued.

### 3. Legacy mode fields
- **TR No.** — required, trimmed, ≤ 50 chars, typed by hand.
- **Customer** — required, picked from the Companies list (`getCompanies`, active only) with a
  searchable picker; fills `customerId`, `companyName`, `tin`, `address` from that company.
- **PO No.** — optional, typed.
- **Date, DR No., Remarks, Notes** — as today.
- **Line items** — manual only (`salesOrderItemId` empty, no discount). "Add manual item" is enabled
  without a selected order. No remaining-amount panel and no order-total cap.

### 4. Server rules (`src/lib/proforma/service.ts`)
- `ProformaInput` gains an optional `legacy` block `{ trNo, customerId, poNo }`. When present and
  `salesOrderId` is empty, the save takes the legacy path.
- Legacy path: actor must be admin (`isAdminUser`), else 403. Customer is re-read on the server from
  the Companies sheet (client-sent name/TIN/address are not trusted). Items are priced with
  `priceProformaItems(items, [])`, which already rejects any SO-linked line. Total must be > 0 to issue.
- **Duplicate guard:** if the typed TR matches the `legacyTrackerNo` of any non-cancelled Sales Order
  in the app, the save is refused with a message naming that SO, so the order-total cap cannot be bypassed.
- An issued legacy proforma must keep legacy mode (cannot be switched to an SO, nor vice versa).
- `changeProforma("issue")` gets the same legacy branch (no SO lookup, admin check, no cap).
- `cancel` and `notes` work unchanged. Numbering, `saveMirrored` and the tracker write are unchanged;
  the tracker reference column already writes `trNo || salesOrderNo`, so TR 1318 lands there.
  The tracker's strict Client Directory check still applies and reports a clear error if the
  customer is missing there.

### 5. Telling new legacy records from migrated ones
New legacy proformas have empty `salesOrderId` **and** empty `importIssue`. Migrated records keep
their import note and keep today's behaviour (view/print only).

### 6. Register and preview
- Sales Order / TR column shows **Legacy TR 1318** for new legacy proformas instead of "Unlinked".
- Edit is shown to admins for legacy drafts and issued legacy proformas; non-admins can view and print.
- The print document is unchanged (it already prints TR/PO from the record).

## Non-goals
- No change to VAT handling, the Sales Invoice screen, or the SALES ORDER TRACKER.
- No lookup or import from the tracker row.
- No ability to later link a legacy proforma to an app Sales Order.

## Builder's calls (flag if wrong)
- Duplicate TR is a hard block, not a warning.
- Migrated proformas stay non-editable.
- Only active companies are offered as customers.

## Verification
Extend `scripts/test-proforma-invoices.cjs`: legacy issue by admin, non-admin refused, duplicate-TR
refused, SO-linked line refused in legacy mode, mode switch refused after issue, tracker write carries
the TR. Then `npx tsc --noEmit`, targeted ESLint, and a browser check of both modes and the printout.
Update `docs/PROFORMA-INVOICES.md`.

# Quotation line kinds + single total price (handoff)

Updated: 2026-09-25. Status: implemented, type-checked, focused tests passing, `next build` passing.
Scope: quotation line-item UI/UX, quotation pricing modes, Sales Order line editor, and
"Create Sales Order from Quotation".

## Behaviour delivered

**Quotation lines.** Every line is explicitly a **Product** or a **Service** (repair work is a
service, never a separate line type). Product lines use the catalog selector; Service lines use one
manual description field and never require a product record. The old pencil / "type manually"
affordance is gone, and lines can be reordered with the arrow controls. A line is a product line
only when it stores a `Products` reference, so no new `QuotationDetails` column was needed.

**Pricing modes.** `PER_LINE` is the historical behaviour and the default for every record that has
no stored mode. `SINGLE_TOTAL` keeps all described lines visible, takes one combined price at
quotation level and shows a single total in the editor, the read-only view, the preview and the
PDF. No per-line price is ever divided out of the combined total. The grand-total formula is
unchanged (`max(basis − discount, 0) + shippingFee`, VAT-inclusive 12/112), so per-line quotations
keep their historical totals byte-for-byte.

**Mode switching.** `planPricingModeSwitch` (pure, tested) keeps descriptions and per-line prices in
state and in storage; switching to single total seeds the combined price from the current line sum
only when the user has not typed one, and switching back restores the line prices unchanged. The
editor shows an explanatory notice for each switch.

**Sales Order editor.** Line type is no longer cramped (3/12) and the category control (4/12) is
aligned with it. Service lines have exactly one labelled description field, no product selector, no
redundant category choice, and a read-only "Services/ Repair · assigned automatically" chip. Product
lines keep meaningful category choices. Switching a line between Product and Service clears product
references (`productId`, `productCodeSnapshot`, `productNameSnapshot`, `customerProductPriceId`,
`customerProductName`), resets the category, keeps the user's description/quantity/unit/price, and
downgrades a product-derived price source to `MANUAL`.

**Text entry (uppercase).** Every free-text `input type="text"` in the Quotations module is
uppercase: the quotation Description, Service line descriptions, the line Unit and the Notations.
The rule is applied when the form loads a saved quotation, on every change (which covers typing and
pasting identically) and again when the payload is built, so the editor, the sheet and the PDF
always agree. It is idempotent, so re-saving an already-uppercase quotation changes nothing.
Deliberately excluded: numeric fields (quantity, unit price, discount, shipping fee, single total
price), read-only/disabled fields (customer address, contact, email, date, quotation no.,
validity, prepared by, and the read-only view's terms), Select values (payment terms, delivery,
warranty, approved by) and catalogue product names — the last two keep the master-record casing
because they are lookups, not typed text.

**Conversion.** `createDraftFromQuotation` preserves the full mixed list and its order.
- Per-line quotations: unchanged (line prices carried as `QUOTATION`, shipping fee still appended as
  a `:SHIPPING` line).
- Single-total quotations: each described line is carried with its description and quantity but
  `unitPrice = null` and `priceSource = NOT_PRICED`; the quoted total is carried **once** on its own
  line (`Combined total as quoted`, quantity 1, `priceSource = QUOTATION`, category `Project`), with
  the quotation discount applied as that line's fixed discount (clamped to the line amount); the
  shipping fee stays a separate line. The order grand total therefore equals the quotation total
  under the same shipping, discount and VAT assumptions (VAT is inclusive, so the grand total is
  unaffected by the per-line tax split).

## Model / API changes (no data migration required)

**Quotations tab layout (the authoritative contract, 21 columns A..U).** The app writes and reads
exactly these columns, in this order, and never inserts, deletes or moves a column:

| Column | Field | Column | Field | Column | Field |
| --- | --- | --- | --- | --- | --- |
| A | QuotationNo | H | **PricingMode** | O | ApprovedBy |
| B | CustomerId | I | **SingleTotalPrice** | P | SentBy |
| C | Customer | J | PaymentTermId | Q | Status |
| D | Description | K | PaymentTerms | R | CreatedBy |
| E | Amount | L | File | S | CreatedAt |
| F | Discount | M | Date | T | UpdatedBy |
| G | ShippingFee | N | PreparedBy | U | UpdatedAt |

- `PricingMode` is **H** and `SingleTotalPrice` is **I**. Historical rows have both blank: a blank
  PricingMode reads as `PER_LINE`, no SingleTotalPrice is inferred, and the stored Amount, Discount
  and ShippingFee are read back unchanged (no repricing, no row rewrites).
- The read/append range is `Quotations!A2:U` (21 columns). Status updates write `Q` plus `T:U`
  only; the PDF file link is written to `L`. Nothing else in a row is touched.
- `QuotationDetails` (A..L) and `QuotationNotations` (A..F) are unchanged.
- `src/lib/quotationRow.ts` owns the layout (indexes, letters, row ranges, parse/build helpers) and
  is unit-tested by `scripts/quotation-tests/row-mapping-test.ts`.
- `Quotation` gains optional `pricingMode` and `singleTotalPrice`; `QuotationDetail` is unchanged.
- Sales Order `PriceSource` gains the value `NOT_PRICED` (value-level only — the `SalesOrderItems`
  column contract is unchanged, so no Apps Script schema change and no migration). `NOT_PRICED`
  lines contribute zero to line/order totals, are excluded from the price requirement in
  `isLineConfirmationReady`, and read as "Included in combined total" in the UI and the order PDF.
- `buildItems` now defaults a blank category by line type (`SERVICE → Services/ Repair`,
  `PRODUCT → Parts`) so the Services/ Repair reporting view stays consistent without asking the user.
- New pure modules `src/lib/quotationPricing.ts` (modes and totals) and `src/lib/quotationRow.ts`
  (column contract) are the single source of truth used by the editor, the Sheets layer, the PDF
  route and the tests.

## Files changed

Added: `src/lib/quotationPricing.ts`, `src/lib/quotationRow.ts`, `src/lib/quotationText.ts`,
`scripts/quotation-tests/*`, `scripts/sales-order-tests/quotation-conversion-test.ts`, this document.
Changed: `src/types/quotation.ts`, `src/types/salesOrder.ts`, `src/lib/quotationSheets.ts`,
`src/app/api/quotations/save-pdf/route.ts`, `src/lib/salesOrders/domain.ts`,
`src/lib/salesOrders/service.ts`, `src/lib/salesOrders/pdf.tsx`,
`src/lib/services/quotation.service.ts`, `src/app/api/quotations/save/route.ts`,
`src/app/api/quotations/[refNo]/route.ts`, `src/app/dashboard/quotations/page.tsx`,
`src/components/quotation-form.tsx`, `src/components/quotation-print-document.tsx`,
`src/components/sales-orders/line-editor.tsx`,
`src/app/dashboard/sales-orders/[id]/page.tsx`, `package.json` (`test:quotations`).

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npm run test:quotations` — pricing-mode tests, the 21-column row-mapping tests
  (complete A..U mapping, historical row with blank H/I, SINGLE_TOTAL save/reopen round trip,
  status/audit/PDF-link updates that leave neighbouring columns untouched) and the uppercase
  text-case tests.
- `npm run test:sales-orders` — existing suites plus the new conversion tests pass.
- `npm run build` — Next.js production build succeeds.

## Manual sheet changes (report)

The application never inserts, deletes or moves columns and never rewrites existing quotation rows,
so no migration script is required. The live `Quotations` tab must already match the A..U layout
above; the only manual check is cosmetic:

- Confirm row 1 labels `H1` = `PricingMode` and `I1` = `SingleTotalPrice` (the app only writes from
  row 2 down, so blank headers would silently still work but make the tab hard to read).
- Confirm `QuotationDetails` still ends at `L` and `QuotationNotations` at `F` (unchanged).
- Historical rows must keep blank H/I; do not backfill PricingMode or SingleTotalPrice for them, and
  do not recompute their Amount/Discount/ShippingFee.

## Remaining constraints

- Per-line quotations still convert with no quotation-level discount carried over (pre-existing
  behaviour, deliberately left unchanged). Their Sales Order total can therefore differ from the
  quotation by the quotation discount. Single-total quotations carry it exactly.
- VAT is reported per line on the order, so the order's `taxTotal` can differ from the quotation's
  VAT by at most a cent due to per-line cent rounding; the grand total is identical.
- Descriptive `NOT_PRICED` lines still need quantity and unit before confirmation (the conversion
  copies the quotation's quantity/unit); a blank quoted unit must be completed on the order.
- The quotation editor does not print a per-line price column in single-total mode, and never
  fabricates one; the stored `unitPrice` values are retained only so switching modes loses nothing.

Quotation notes and discount setup
================================

Run the append-only migration once before using this release:

```powershell
node --env-file=.env.local scripts/migrate-discount-columns.mjs
node --env-file=.env.local scripts/migrate-discount-columns.mjs --apply
```

The first command previews the changes. The second adds four headers. No new
tabs are needed, no data rows are changed, and existing columns stay in place.
The script refuses to overwrite an occupied column and can be rerun safely.

If you prefer updating Google Sheets manually, add these exact headers at the
end of the existing tabs. Do not insert columns between existing fields.

| Tab | Cell | Header |
| --- | --- | --- |
| Quotations | V1 | DiscountSettings |
| QuotationDetails | M1 | LineMetadata |
| SalesOrders | AJ1 | DiscountSettings |
| SalesOrderItems | AF1 | DiscountSettings |

Leave existing rows blank in these new columns. The application stores JSON in
these cells. QuotationDetails LineMetadata contains multiline notes and optional
item discount settings; the other cells contain discount mode, type, entered
value, percentage basis and item scope. Existing peso Discount / DiscountAmount
columns continue to store the calculated deduction for compatibility.

ServiceInvoices needs no new columns: the existing T (ManualCompletionData)
metadata cell stores the inherited/manual discount snapshot and stable Sales
Order item references, alongside its existing completion/payment information.
ServiceInvoiceItems and Customer Prices need no changes.

Behavior
--------

- Quotations default to overall peso discounts. Percentage is optional and uses
  the VAT-inclusive subtotal by default; VAT-exclusive basis is optional.
- Per-item discounts are an alternative, never combined with an overall
  discount. Peso item discounts default to the full line; per unit is optional.
  One-total-price quotations use overall discounts because their descriptive
  lines have no independent prices.
- Tax is recalculated after the discount. Shipping stays outside the discount
  basis, matching the existing quotation calculation.
- Customer Prices fills a product's initial price. Manual quotation prices are
  saved and retained when reopening; Customer Prices records are not changed.
- Quotation item notes preserve line breaks in the editor, preview and PDF.
  Notes remain on the quotation; discounts carry into Sales Orders.
- Editing discounts on an existing Sales Order requires a reason stored in
  SalesOrderHistory. The Sales Order becomes the invoice's discount authority.
- Linked service invoice discounts are read-only. Legacy SO/TR invoices allow
  manual overall discounts. Choose Legacy SO / TR Number for manual references.
- Partial invoices receive proportional discounts; leftover cents are allocated
  deterministically so the complete invoice set matches the order deduction.
- Only Draft and Created invoices refresh when the order changes. Other invoice
  statuses retain their saved discount snapshot. Previously printed copies are
  physical records; use the current preview to reprint updated Created invoices.

Verification
------------

```powershell
npx tsc --noEmit
npm run test:quotations
npm run test:sales-orders
npm run build
```

Before rollout, run a live acceptance check with a saved quotation, quotation to
Sales Order conversion, partial invoice, discount revision with a reason, and
Created-invoice reprint. Check the multiline notes in a multipage quotation PDF.

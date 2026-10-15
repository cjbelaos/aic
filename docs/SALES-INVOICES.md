# Sales and Service Invoices

Sales Invoices are available at `/dashboard/sales-invoices`. The register, editing, payment labels, scans, reports and physical-form print layout are shared with Service Invoices.

## Business rules

- Invoice numbers are entered from the paper form and unique within each invoice type. Draft placeholders require a physical number before finalization.
- Sales Invoice categories are required, editable and multi-select: Project, Parts, Consumables, Supplies, Treatment Package. A supported Sales Order category is selected initially; Service/PMS never carry across.
- Sales Order selection loads active priced lines with their remaining non-cancelled quantities. Users may change prices/quantities/descriptions, remove lines or add manual lines. Only explicitly linked lines inherit order discounts; manual additions receive no inherited discount.
- Sales Invoice has a required invoice-delivery PIC, selected from the existing application user choices. It is never printed. Service Invoice keeps its existing technician/DR assignment and has no separate PIC requirement.
- Sales Order no longer exposes or requires PIC assignment. Existing stored assignee values are preserved for compatibility. Manual service completion permission follows the invoice technician or an administrator.
- VAT remains 12% inclusive after commercial discount. Withholding equals rounded net-of-VAT times 2% for Service Invoice and 1% for Sales Invoice. Per approved business rules it does not reduce total due, recorded payments or balances.
- Zero-rated and VAT-exempt print positions are empty. The special statutory discount row remains a dash. The physical print template adds neither invoice title nor PIC.
- Existing invoice previews/prints use current withholding calculations, including paid invoices. Uploaded physical scans remain original evidence.

## Storage and setup

`invoiceRepository.ts` creates independent repositories for ServiceInvoices/ServiceInvoiceItems and SalesInvoices/SalesInvoiceItems. The same invoice number may exist in both. PIC is stored in SalesInvoices column T metadata; no Service Invoice columns were moved or renamed. Document Tracker keys include document type and number.

Run `node --env-file=.env.local scripts/provision-sales-invoices.mjs` to verify schema, or add `--apply` to provision only missing sales tabs/headers. This was applied to the current development database on 2026-10-15. Other environments need the same setup before using the page.

Scans use the existing invoice Drive storage folder with a distinct `SALES-INVOICE-SCANNED_` filename prefix and are linked only to the Sales Invoice repository.

## Verification

`npm run test:sales-invoices` covers totals, print markup, blank fields, category restrictions, explicit-line discounts, PIC requirements, independent numbering/payment/scan storage and DR/PIC separation using in-memory Sheets. `npm run test:service-invoice-billing` checks service billing regressions. `npm run test:sales-orders` covers the underlying order domain.

---
title: "AIC Sales Order Categories and Service Invoice Filters"
type: ai-knowledge
status: draft
owner: "Chris"
created: 2026-10-02
updated: 2026-10-02
ai_access: internal
ai_generated: true
review_status: draft
contributed_by:
  model: GPT-6
  confidence: verified
source_project: AIC
---

# Agreed business rules

Chris confirmed these rules on 2026-10-02 for the Sales Order Register and Service Invoice filtering.

- Derive the Sales Order display category from distinct nonblank category snapshots on ACTIVE lines; ignore INACTIVE lines.
- Project takes priority over every other category, including Services / Repair.
- Otherwise, any Services / Repair category produces the display category Service.
- Otherwise, combine categories with ` / `. Parts is first, with remaining categories alphabetically ordered: Parts / Consumables. A single category keeps its name.
- Orders with no usable category display Uncategorized.
- Invoice category comes from its linked Sales Order, including the order inherited through a Delivery Receipt. Contract-only invoices without an order are categorized PMS. Missing links/categories use Uncategorized.
- Customer filtering supports multiple selections (OR); Customer and date filters combine with AND. Chris subsequently requested removal of the Service Invoice register Category filter and the category narrowing controls in Delivery Release and Service Invoice Add/Edit Items. Delivery Release product pickers search the full catalog. Service Invoice create/edit forms use the existing manual workflow: Description, Qty, Unit Price, and Amount; the optional catalog selector and product autofill were removed at Chris's request. Sales Order category rules and the invoice Category display remain.
- Date Range and Month use Invoice Date. Date endpoints are inclusive. Month includes the year. Selecting either date mode clears the other.
- Filtering preserves a linked-Delivery-Receipt view, works with table search, resets pagination, and updates invoice summary cards.

# Implementation references

Source repository: `C:\Users\chris\aic`.

- `src/lib/salesOrders/domain.ts`: shared category derivation; saved line categories are retained.
- `src/app/api/service-invoices/route.ts`: invoice category enrichment using all historical order records/items and a batch Delivery Receipt link lookup.
- `src/lib/serviceInvoiceFilters.ts`: invoice category fallback and filter predicates.
- `src/app/dashboard/service-invoices/page.tsx`: multi-select filters, mutually exclusive date controls, derived Category column, and filtered cards.
- `scripts/sales-order-tests/invoice-filters-test.ts`: category fallback, combined filters, inclusive dates, and month/year regression checks.

The quotation conversion creates a Project line named "Combined total as quoted" for single-total quotations. Because Project wins, such an order displays Project even if it also includes service lines. Categories are calculated on read; no Google Sheets schema migration or stored-line rewrite is required.

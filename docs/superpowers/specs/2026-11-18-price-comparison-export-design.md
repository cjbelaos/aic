# Product Price Comparison (print + Excel) — short design

## Intent
The CEO wants to see all products with purchase price and selling price together, and compare
purchase prices across suppliers. He wants it as an Excel file and as an A4 portrait printout.

## Goals
- One report: every active product, one line per active supplier offering, with purchase price,
  default selling price, and margin.
- Printable on A4 portrait (small text so all columns fit on one line), and downloadable as Excel.

## Non-goals
- Customer-specific prices (Default Selling Price only — confirmed).
- Company header or branded document layout (confirmed: table only).
- Role restriction (my call: same access as the existing Products export).

## Approach (chosen: A)
- **A. Preview window with Print and Download Excel** — chosen.
- B. Excel only with A4 page setup — rejected: Excel decides page breaks/font size.
- C. Generated PDF + Excel — rejected: a second layout to maintain for the same report.

## Design
- **Entry point:** new toolbar button on the Products page, "Price Comparison", next to Export.
  Opens a preview dialog with the table and two buttons: **Print** and **Download Excel**.
- **Data (client-side, already loaded or one extra call):** active products
  (`productService.getAll`), active supplier products (`supplierProductService.getAll({ status: "active" })`),
  supplier names from companies.
- **Rows:** one per active supplier link. A product with no active supplier still appears once
  with blank supplier/purchase/margin.
- **Sorting:** product name A–Z; within a product, preferred supplier first, then lowest cost.
- **Columns (print and preview):** Code · Product · Unit · Supplier (★ when preferred) ·
  Purchase Price · Selling Price · Margin · Margin %.
  - Margin = Default Selling Price − Purchase Price.
  - Margin % = Margin ÷ Default Selling Price; blank when selling price is 0 or unset.
  - Negative margins shown in red.
  - Code/Product/Unit printed only on the first line of each product group.
- **Print:** table only, no header block. A4 portrait, ~7–8pt text, one line per row (truncate
  long names with ellipsis rather than wrap), column header row repeats on every page,
  rows never split across pages. Uses a print window like the existing business documents,
  without the company header.
- **Excel (`product-price-comparison-YYYY-MM-DD.xlsx`):** one sheet, every row self-contained
  (product fields repeated on each supplier line so Excel filtering works). Columns:
  Product Code, Product, Category, Unit, Supplier, Supplier Product Code, Purchase Price,
  Preferred (Yes/blank), Default Selling Price, Margin, Margin %. Frozen header row,
  autofilter, `#,##0.00` for pesos, `0.0%` for Margin %, negative margins red.

## Left to the builder
- Exact column widths and font size needed to fit A4 portrait.
- Where the report-building helper lives (e.g. `src/lib/priceComparisonReport.ts`).

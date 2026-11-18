# Product Price Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Price Comparison" button on the Products page that opens a preview of every active product with each supplier's purchase price, the default selling price and margin, which can be printed on A4 portrait or downloaded as Excel.

**Architecture:** A pure row builder (`priceComparisonReport.ts`) joins products, supplier products and companies into sorted rows. Two renderers consume those rows: a React print table shown inside the existing `BusinessDocumentPrintFrame` iframe (which already handles A4 printing and preview scaling), and an ExcelJS workbook builder. A dialog on the Products page wires them together.

**Tech Stack:** Next.js 16 client components, React 19, ExcelJS 4, shadcn `Dialog`/`Button`, sonner toasts. Tests are plain Node `.cjs` scripts using `scripts/proforma-runtime.cjs` (`createLoader`) and `node:assert/strict`, matching existing `scripts/test-*.cjs`.

**Spec:** `docs/superpowers/specs/2026-11-18-price-comparison-export-design.md`

## Global Constraints

- Default Selling Price only — no customer-specific prices.
- Print is table only: no company header, no title block. A4 portrait.
- Print columns, in order: Code · Product · Unit · Supplier · Purchase Price · Selling Price · Margin · Margin %.
- Excel columns, in order: Product Code, Product, Category, Unit, Supplier, Supplier Product Code, Purchase Price, Preferred, Default Selling Price, Margin, Margin %.
- Excel file name: `product-price-comparison-YYYY-MM-DD.xlsx` (local date).
- Peso format `#,##0.00`; Margin % format `0.0%`; negative margins red (print and Excel).
- Preferred supplier marked `★` in print; `Yes` / blank in Excel.
- Margin = Default Selling Price − Purchase Price. Margin % = Margin ÷ Default Selling Price, blank when the selling price is 0 or unset.
- Same access as the existing Products export (no role check).

## Review Focus

1. **Product with no Default Selling Price** (`defaultSellingPrice` undefined) — Selling, Margin and Margin % must be blank, not ₱0 / −cost. Test in Task 1.
2. **Supplier link whose product is inactive, or link that is inactive** — excluded entirely; an inactive product never appears. Test in Task 1.
3. **Supplier company missing from the companies list** (deleted/inactive company) — row still shown, supplier name falls back to the supplier ID. Test in Task 1.
4. **Names with `&`, `<`, `"`** — render as text in print (React escapes; assert no raw `<b>` survives). Test in Task 2.
5. **Very long product or supplier names** — stay on one line, cut with ellipsis, never widen the table past A4. Test in Task 2 (CSS assertions).

---

## File Structure

- Create `src/lib/priceComparisonReport.ts` — types + `buildPriceComparisonRows` (pure, no runtime imports).
- Create `src/components/price-comparison-print-document.tsx` — React table for print/preview.
- Create `src/lib/priceComparisonExport.ts` — `buildPriceComparisonWorkbook` + `downloadPriceComparisonExcel`.
- Create `src/components/price-comparison-dialog.tsx` — dialog: loads supplier products, preview frame, Print / Download Excel.
- Modify `src/app/dashboard/products/page.tsx` — toolbar button + dialog.
- Create `scripts/test-price-comparison.cjs`; modify `package.json` — add `"test:price-comparison": "node scripts/test-price-comparison.cjs"`.

---

### Task 1: Row builder

**Files:**
- Create: `src/lib/priceComparisonReport.ts`
- Create: `scripts/test-price-comparison.cjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `Product` (`@/types/product`, uses `productId ?? id`, `code`, `name`, `category.name`, `unit.code`, `defaultSellingPrice`, `status`), `SupplierProduct` (`@/types/supplier-product`), `Company` (`@/types/company`, uses `companyId`, `companyName`). Type-only imports.
- Produces:
  ```ts
  export interface PriceComparisonRow {
    productId: string;
    productCode: string;
    productName: string;
    categoryName: string;
    unit: string;               // product.unit.code
    supplierName?: string;      // undefined when the product has no active supplier
    supplierProductCode?: string;
    isPreferred: boolean;
    purchasePrice?: number;
    sellingPrice?: number;      // product.defaultSellingPrice
    margin?: number;            // set only when both prices are set
    marginPercent?: number;     // fraction (0.308), set only when margin set and sellingPrice > 0
    isFirstOfProduct: boolean;  // true on the first row of each product group
  }
  export function buildPriceComparisonRows(products: Product[], supplierProducts: SupplierProduct[], companies: Company[]): PriceComparisonRow[];
  ```

- [ ] **Step 1: Write the failing test** in `scripts/test-price-comparison.cjs` (header: `/* eslint-disable @typescript-eslint/no-require-imports */`, load via `createLoader()` from `./proforma-runtime.cjs`). Fixture: products `P1` "Printer Ink" (unit `PC`, selling 650), `P2` "bond paper" (selling undefined), `P3` "Archived" (status `inactive`), `P4` "Zero Price" (selling 0); supplier products: `P1`/`S1` cost 480 not preferred, `P1`/`S2` cost 450 preferred, `P1`/`S3` cost 400 not preferred, `P1`/`S4` cost 500 status `inactive`, `P3`/`S1` cost 10, `P4`/`S1` cost 20; companies `S1` "XYZ Supply", `S2` "ABC Trading" (no `S3` company). Assert:
  ```js
  const rows = buildPriceComparisonRows(products, supplierProducts, companies);
  assert.deepEqual(rows.map(r => [r.productName, r.supplierName ?? null]), [
    ["bond paper", null], ["Printer Ink", "ABC Trading"], ["Printer Ink", "S3"], ["Printer Ink", "XYZ Supply"], ["Zero Price", "XYZ Supply"],
  ]); // A–Z case-insensitive; preferred first, then lowest cost; inactive product & link excluded; missing company → ID
  assert.deepEqual(rows.map(r => r.isFirstOfProduct), [true, true, false, false, true]);
  const abc = rows[1];
  assert.equal(abc.isPreferred, true); assert.equal(abc.margin, 200); assert.ok(Math.abs(abc.marginPercent - 200 / 650) < 1e-9);
  const bond = rows[0];
  assert.equal(bond.purchasePrice, undefined); assert.equal(bond.sellingPrice, undefined); assert.equal(bond.margin, undefined); assert.equal(bond.marginPercent, undefined);
  const zero = rows[4];
  assert.equal(zero.margin, -20); assert.equal(zero.marginPercent, undefined);
  assert.deepEqual(buildPriceComparisonRows([], [], []), []);
  ```
  End with `console.log("Price comparison: rows passed.")`.

- [ ] **Step 2: Run it to verify it fails**
  Run: `node scripts/test-price-comparison.cjs`
  Expected: FAIL — cannot find `src/lib/priceComparisonReport`.

- [ ] **Step 3: Implement `buildPriceComparisonRows` in `src/lib/priceComparisonReport.ts`.** Product sort: `localeCompare` with `{ sensitivity: "base" }` on name, then code. Supplier sort within a product: preferred first, then `costPerUnit` ascending, then supplier name. Products whose `status === "inactive"` are dropped; only supplier products with `status === "active"` count. Add `"test:price-comparison": "node scripts/test-price-comparison.cjs"` to `package.json` scripts (follow the file's existing leading-comma style).

- [ ] **Step 4: Run it to verify it passes**
  Run: `npm run test:price-comparison`
  Expected: `Price comparison: rows passed.`

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/priceComparisonReport.ts scripts/test-price-comparison.cjs package.json
  git commit -m "feat: build product price comparison rows"
  ```

---

### Task 2: Print table

**Files:**
- Create: `src/components/price-comparison-print-document.tsx`
- Modify: `scripts/test-price-comparison.cjs`

**Interfaces:**
- Consumes: `PriceComparisonRow` (Task 1).
- Produces: `export function PriceComparisonPrintDocument({ rows }: { rows: PriceComparisonRow[] }): JSX.Element` — renders `<div className="receipt price-comparison">` containing an inline `<style>` and one `<table>`. It is rendered as a child of `BusinessDocumentPrintFrame` (whose shell already sets `@page { size: A4 portrait; margin: 12mm }`, `table-layout: fixed`, `thead { display: table-header-group }`, and `.receipt` print reset).

- [ ] **Step 1: Write the failing test** — append to `scripts/test-price-comparison.cjs`, render with `react-dom/server` `renderToStaticMarkup` using the Task 1 fixture rows plus one extra row whose `productName` is `'Ink & <b>"Bold"</b>'`. Assert:
  ```js
  const html = renderToStaticMarkup(React.createElement(PriceComparisonPrintDocument, { rows }));
  const headers = [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(headers, ["Code", "Product", "Unit", "Supplier", "Purchase Price", "Selling Price", "Margin", "Margin %"]);
  assert.ok(html.includes("ABC Trading ★"));
  assert.ok(html.includes("200.00") && html.includes("30.8%"));
  assert.ok(html.includes("(no supplier)"));
  assert.equal((html.match(/>Printer Ink</g) || []).length, 1);   // product shown once per group
  assert.ok(/class="[^"]*negative[^"]*"[^>]*>-20\.00/.test(html)); // red negative margin
  assert.ok(!html.includes("<b>") && html.includes("&lt;b&gt;"));  // escaped
  assert.ok(html.includes("white-space:nowrap") && html.includes("text-overflow:ellipsis")); // long names
  assert.ok(!/business-document-header|<img/.test(html));         // no header
  ```

- [ ] **Step 2: Run it to verify it fails**
  Run: `npm run test:price-comparison`
  Expected: FAIL — cannot find `price-comparison-print-document`.

- [ ] **Step 3: Implement `PriceComparisonPrintDocument`.** Inline CSS goes in `<style dangerouslySetInnerHTML={{ __html: css }} />` (a constant string, so no injection risk), minified with no spaces around `:` so the assertions match: body text `7.5pt`; every `th, td` `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 4px`; numeric columns right-aligned; `tr{break-inside:avoid}`; `.negative{color:#c00}`; header row bottom border; `<colgroup>` widths summing to 100% (suggested: 11/25/6/20/10/10/9/9). Money via `toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`; percent as `(fraction * 100).toFixed(1) + "%"`; blank cell for undefined values; "(no supplier)" in the supplier cell when `supplierName` is undefined; Code/Product/Unit cells empty unless `isFirstOfProduct`. Add a `title` attribute with the full text on Product and Supplier cells so the preview shows truncated names on hover.

- [ ] **Step 4: Run it to verify it passes**
  Run: `npm run test:price-comparison`
  Expected: both sections pass.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/price-comparison-print-document.tsx scripts/test-price-comparison.cjs
  git commit -m "feat: add A4 price comparison print table"
  ```

---

### Task 3: Excel workbook

**Files:**
- Create: `src/lib/priceComparisonExport.ts`
- Modify: `scripts/test-price-comparison.cjs`

**Interfaces:**
- Consumes: `PriceComparisonRow` (Task 1).
- Produces:
  ```ts
  export async function buildPriceComparisonWorkbook(rows: PriceComparisonRow[]): Promise<import("exceljs").Workbook>;
  export async function downloadPriceComparisonExcel(rows: PriceComparisonRow[], today?: Date): Promise<void>; // file product-price-comparison-YYYY-MM-DD.xlsx
  ```
  Load ExcelJS with `(await import("exceljs")).default`, as `src/lib/supplierProductExport.ts` does.

- [ ] **Step 1: Write the failing test** — append to the script, using the Task 1 fixture rows only (not Task 2's extra escaping row). Sheet rows: 2 bond paper, 3 Printer Ink/ABC (preferred), 4 Printer Ink/S3, 5 Printer Ink/XYZ, 6 Zero Price.
  ```js
  const wb = await buildPriceComparisonWorkbook(rows);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, "Price Comparison");
  assert.deepEqual(ws.getRow(1).values.slice(1), ["Product Code", "Product", "Category", "Unit", "Supplier", "Supplier Product Code", "Purchase Price", "Preferred", "Default Selling Price", "Margin", "Margin %"]);
  assert.equal(ws.rowCount, rows.length + 1);
  assert.equal(ws.getRow(4).getCell(2).value, "Printer Ink"); // second Printer Ink row repeats product fields
  assert.equal(ws.getRow(3).getCell(8).value, "Yes");         // preferred
  assert.equal(ws.getRow(2).getCell(5).value, null);  // bond paper: no supplier → empty
  assert.equal(ws.getRow(2).getCell(10).value, null); // no margin
  assert.equal(ws.getColumn(7).numFmt, "#,##0.00");
  assert.equal(ws.getColumn(11).numFmt, "0.0%");
  assert.equal(ws.getRow(5).getCell(8).value, null);  // non-preferred → blank
  assert.deepEqual(ws.views[0], { state: "frozen", ySplit: 1 });
  assert.ok(ws.autoFilter);
  // negative margin cell is red
  const zeroRow = rows.findIndex(r => r.margin === -20) + 2;
  assert.equal(ws.getRow(zeroRow).getCell(10).font.color.argb, "FFCC0000");
  ```
  Wrap the existing test body in an `async` IIFE with `.catch(e => { console.error(e); process.exitCode = 1; })`, as `test-supplier-product-workflow.cjs` does.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npm run test:price-comparison`
  Expected: FAIL — cannot find `priceComparisonExport`.

- [ ] **Step 3: Implement both functions.** Undefined values are written as `null` (empty cell). Margin % is written as the fraction. Column widths are a builder's choice (≈ 14/40/18/8/30/18/14/10/16/12/10). `downloadPriceComparisonExcel` writes the buffer to a Blob and clicks a temporary link, using the same link/revoke pattern as `exportSupplierProducts`.

- [ ] **Step 4: Run it to verify it passes**
  Run: `npm run test:price-comparison`
  Expected: all sections pass.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/priceComparisonExport.ts scripts/test-price-comparison.cjs
  git commit -m "feat: export product price comparison to Excel"
  ```

---

### Task 4: Dialog and Products page button

**Files:**
- Create: `src/components/price-comparison-dialog.tsx`
- Modify: `src/app/dashboard/products/page.tsx`

**Interfaces:**
- Consumes: `buildPriceComparisonRows` (Task 1), `PriceComparisonPrintDocument` (Task 2), `downloadPriceComparisonExcel` (Task 3), `BusinessDocumentPrintFrame` + `BusinessDocumentPrintHandle` (`@/components/business-document-print-frame`), `supplierProductService.getAll({ status: "active" })`.
- Produces: `export function PriceComparisonDialog({ open, onOpenChange, products, companies }: { open: boolean; onOpenChange: (open: boolean) => void; products: Product[]; companies: Company[] }): JSX.Element`.

- [ ] **Step 1: Implement `PriceComparisonDialog`.**
  - On each open, fetch active supplier products and show the existing loader until they arrive.
  - Build rows with `useMemo`.
  - Layout: `DialogContent` at `sm:max-w-[80vw] h-[90dvh]` with a flex column, title "Price Comparison", and a footer with **Print** and **Download Excel** buttons. Between them sits the `BusinessDocumentPrintFrame` (title `Product Price Comparison`), filling the space and wrapping `<PriceComparisonPrintDocument rows={rows} />`.
  - **Print** calls `ref.current.print()`.
  - When there are no rows, show "No active products to show." and disable both buttons.
  - Failures go to `toast.error`: "Failed to load supplier prices." on fetch failure, and the thrown message on print or download failure.

- [ ] **Step 2: Wire it into the Products page.**
  - Add `const [priceComparisonOpen, setPriceComparisonOpen] = useState(false)`.
  - Add a `<Button variant="outline" size="sm">` labelled **Price Comparison** inside the existing `toolbarFilters` fragment, after the "Show inactive" switch.
  - Render `<PriceComparisonDialog open={priceComparisonOpen} onOpenChange={setPriceComparisonOpen} products={data} companies={suppliers} />` next to `ProductDetailDrawer`.
  - Pass `data`, the full list, because the builder drops inactive products itself.

- [ ] **Step 3: Verify types and lint**
  Run: `npx tsc --noEmit -p .` → no output.
  Run: `npx eslint src/components/price-comparison-dialog.tsx src/components/price-comparison-print-document.tsx src/lib/priceComparisonReport.ts src/lib/priceComparisonExport.ts` → no errors.
  Run: `npm run test:price-comparison` → all sections pass.

- [ ] **Step 4: Verify in the browser** (`npm run dev`, open `/dashboard/products`):
  - Click Price Comparison. The preview lists products A–Z with ★ on preferred suppliers and red negative margins, and products without a supplier show "(no supplier)".
  - Click Print. The browser print preview is A4 portrait with no header, every row on one line, the column headers repeated on page 2, and no row split across pages.
  - Click Download Excel. The file is `product-price-comparison-2026-11-18.xlsx` with 11 columns, a frozen header, filters, peso formats and red negatives.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/price-comparison-dialog.tsx src/app/dashboard/products/page.tsx
  git commit -m "feat: add Price Comparison preview to Products page"
  ```

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createLoader } = require("./proforma-runtime.cjs");

const load = createLoader();

const product = (productId, name, extra = {}) => ({
  id: productId, productId, code: `CODE-${productId}`, name,
  category: { id: "CAT", code: "CAT", name: "Supplies" },
  unit: { id: "U", code: "PC", name: "Piece" },
  description: "", costPerUnit: 0, pricePerUnit: extra.defaultSellingPrice ?? 0,
  status: "active", ...extra,
});
const link = (id, productId, supplierId, costPerUnit, extra = {}) => ({
  supplierProductId: id, productId, supplierId, supplierProductName: `${productId}/${supplierId}`,
  costPerUnit, isPreferredSupplier: false, status: "active", createdAt: "", createdBy: "", ...extra,
});

const products = [
  product("P1", "Printer Ink", { defaultSellingPrice: 650 }),
  product("P2", "bond paper", { defaultSellingPrice: undefined }),
  product("P3", "Archived", { defaultSellingPrice: 100, status: "inactive" }),
  product("P4", "Zero Price", { defaultSellingPrice: 0 }),
];
const supplierProducts = [
  link("SP1", "P1", "S1", 480),
  link("SP2", "P1", "S2", 450, { isPreferredSupplier: true }),
  link("SP3", "P1", "S3", 400),
  link("SP4", "P1", "S4", 500, { status: "inactive" }),
  link("SP5", "P3", "S1", 10),
  link("SP6", "P4", "S1", 20),
];
const companies = [
  { companyId: "S1", companyName: "XYZ Supply" },
  { companyId: "S2", companyName: "ABC Trading" },
];

(async () => {
  // ── Rows ──────────────────────────────────────────────
  const { buildPriceComparisonRows } = load("src/lib/priceComparisonReport.ts");
  const rows = buildPriceComparisonRows(products, supplierProducts, companies);
  assert.deepEqual(rows.map((r) => [r.productName, r.supplierName ?? null]), [
    ["bond paper", null],
    ["Printer Ink", "ABC Trading"],
    ["Printer Ink", "S3"],
    ["Printer Ink", "XYZ Supply"],
    ["Zero Price", "XYZ Supply"],
  ]);
  assert.deepEqual(rows.map((r) => r.isFirstOfProduct), [true, true, false, false, true]);
  const abc = rows[1];
  assert.equal(abc.isPreferred, true);
  assert.equal(abc.unit, "PC");
  assert.equal(abc.categoryName, "Supplies");
  assert.equal(abc.margin, 200);
  assert.ok(Math.abs(abc.marginPercent - 200 / 650) < 1e-9);
  const bond = rows[0];
  assert.equal(bond.purchasePrice, undefined);
  assert.equal(bond.sellingPrice, undefined);
  assert.equal(bond.margin, undefined);
  assert.equal(bond.marginPercent, undefined);
  const zero = rows[4];
  assert.equal(zero.margin, -20);
  assert.equal(zero.marginPercent, undefined);
  assert.deepEqual(buildPriceComparisonRows([], [], []), []);
  console.log("Price comparison: rows passed.");

  // ── Print table ───────────────────────────────────────
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PriceComparisonPrintDocument } = load("src/components/price-comparison-print-document.tsx");
  const printRows = [...rows, { ...rows[1], productId: "P9", productName: 'Ink & <b>"Bold"</b>', isFirstOfProduct: true }];
  const html = renderToStaticMarkup(React.createElement(PriceComparisonPrintDocument, { rows: printRows }));
  const headers = [...html.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, ["Code", "Product", "Unit", "Supplier", "Purchase Price", "Selling Price", "Margin", "Margin %"]);
  assert.ok(html.includes("ABC Trading ★"));
  assert.ok(html.includes("200.00") && html.includes("30.8%"));
  assert.ok(html.includes("(no supplier)"));
  assert.equal((html.match(/>Printer Ink</g) || []).length, 1);
  assert.ok(/class="[^"]*negative[^"]*"[^>]*>-20\.00/.test(html));
  assert.ok(!html.includes("<b>") && html.includes("&lt;b&gt;"));
  assert.ok(html.includes("white-space:nowrap") && html.includes("text-overflow:ellipsis"));
  assert.ok(!/business-document-header|<img/.test(html));
  console.log("Price comparison: print table passed.");

  // ── Excel workbook (Task 1 fixture rows only) ─────────
  // Sheet rows: 2 bond paper, 3 Printer Ink/ABC (preferred), 4 Printer Ink/S3, 5 Printer Ink/XYZ, 6 Zero Price.
  const { buildPriceComparisonWorkbook } = load("src/lib/priceComparisonExport.ts");
  const wb = await buildPriceComparisonWorkbook(rows);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, "Price Comparison");
  assert.deepEqual(ws.getRow(1).values.slice(1), ["Product Code", "Product", "Category", "Unit", "Supplier", "Supplier Product Code", "Purchase Price", "Preferred", "Default Selling Price", "Margin", "Margin %"]);
  assert.equal(ws.rowCount, rows.length + 1);
  assert.equal(ws.getRow(4).getCell(2).value, "Printer Ink");
  assert.equal(ws.getRow(3).getCell(8).value, "Yes");
  assert.equal(ws.getRow(2).getCell(5).value, null);
  assert.equal(ws.getRow(2).getCell(10).value, null);
  assert.equal(ws.getColumn(7).numFmt, "#,##0.00");
  assert.equal(ws.getColumn(11).numFmt, "0.0%");
  assert.equal(ws.getRow(5).getCell(8).value, null);
  assert.deepEqual(ws.views[0], { state: "frozen", ySplit: 1 });
  assert.ok(ws.autoFilter);
  const zeroRow = rows.findIndex((r) => r.margin === -20) + 2;
  assert.equal(ws.getRow(zeroRow).getCell(10).font.color.argb, "FFCC0000");
  console.log("Price comparison: Excel workbook passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

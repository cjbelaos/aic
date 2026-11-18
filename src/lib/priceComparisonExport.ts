import type { Workbook } from "exceljs";
import type { PriceComparisonRow } from "@/lib/priceComparisonReport";

const HEADERS = ["Product Code", "Product", "Category", "Unit", "Supplier", "Supplier Product Code", "Purchase Price", "Preferred", "Default Selling Price", "Margin", "Margin %"];
const WIDTHS = [14, 40, 18, 8, 30, 18, 14, 10, 16, 12, 10];
const MONEY_COLUMNS = [7, 9, 10];
const MARGIN_COLUMNS = [10, 11];
const RED = "FFCC0000";

/** One self-contained row per supplier line so Excel filtering and sorting work. */
export async function buildPriceComparisonWorkbook(rows: PriceComparisonRow[]): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Price Comparison");
  sheet.addRow(HEADERS);
  for (const row of rows) {
    const added = sheet.addRow([
      row.productCode, row.productName, row.categoryName, row.unit,
      row.supplierName ?? null, row.supplierProductCode ?? null, row.purchasePrice ?? null,
      row.isPreferred ? "Yes" : null, row.sellingPrice ?? null, row.margin ?? null, row.marginPercent ?? null,
    ]);
    if (row.margin !== undefined && row.margin < 0) {
      for (const column of MARGIN_COLUMNS) added.getCell(column).font = { color: { argb: RED } };
    }
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: HEADERS.length } };
  WIDTHS.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (const column of MONEY_COLUMNS) sheet.getColumn(column).numFmt = "#,##0.00";
  sheet.getColumn(11).numFmt = "0.0%";
  return workbook;
}

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export async function downloadPriceComparisonExcel(rows: PriceComparisonRow[], today = new Date()): Promise<void> {
  const workbook = await buildPriceComparisonWorkbook(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `product-price-comparison-${localDate(today)}.xlsx`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

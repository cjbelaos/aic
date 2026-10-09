import type { SupplierProduct } from "@/types/supplier-product";

export type SupplierProductExportRow = SupplierProduct & {
  canonicalProductName: string;
  canonicalProductCode: string;
  supplierName: string;
};

export async function exportSupplierProducts(rows: SupplierProductExportRow[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Supplier Products");
  sheet.addRow(["Supplier", "Supplier Product Code", "Supplier Product Name", "Description", "Product Code", "Canonical Product", "Cost / Unit (PHP)", "Preferred Supplier", "Status", "Supplier Product ID", "Supplier ID", "Product ID"]);
  for (const row of rows) {
    sheet.addRow([row.supplierName, row.supplierProductCode || "", row.supplierProductName, row.supplierDescription || "", row.canonicalProductCode, row.canonicalProductName, row.costPerUnit, row.isPreferredSupplier ? "Yes" : "No", row.status, row.supplierProductId, row.supplierId, row.productId]);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  sheet.columns.forEach((column) => { column.width = 26; });
  for (const index of [1, 3, 4, 6]) sheet.getColumn(index).width = 45;
  sheet.getColumn(7).numFmt = '#,##0.00';
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "supplier-products-filtered.xlsx";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

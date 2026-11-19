import type { HistoryRow } from "@/lib/inventory/domain";

const TYPE_LABEL: Record<string, string> = {
  OPENING: "Opening count",
  RECEIVED: "Received",
  RETURN: "Customer return",
  ADJUSTMENT: "Adjustment",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  DR: "Delivery",
};

const STATUS_LABEL: Record<string, string> = { active: "Counted", void: "Voided", pending_approval: "Pending approval" };

/** Downloads every stock movement (entries, transfers and deliveries) as an Excel file. */
export async function exportStockMovements(
  rows: HistoryRow[],
  names: {
    warehouse: (id: string) => string;
    product: (id: string) => { code: string; name: string };
  },
  scope: { warehouse: string },
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock Movements");
  sheet.addRow(["Date", "Warehouse", "Product Code", "Product", "Type", "Qty", "Status", "Document", "Reference No.", "Note", "Entered By"]);
  for (const row of rows) {
    const product = names.product(row.productId);
    sheet.addRow([
      row.date,
      names.warehouse(row.warehouseId),
      product.code,
      product.name,
      TYPE_LABEL[row.type] ?? row.type,
      row.qty,
      STATUS_LABEL[row.status] ?? row.status,
      row.source.label,
      row.source.kind === "DR" ? "" : row.referenceNo,
      row.note,
      row.by,
    ]);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sheet.rowCount, 1), column: sheet.columnCount } };
  sheet.columns.forEach((column) => { column.width = 18; });
  sheet.getColumn(4).width = 45;
  sheet.getColumn(6).numFmt = "#,##0.####";
  sheet.getColumn(10).width = 50;

  const details = workbook.addWorksheet("Export Details");
  details.addRows([
    ["Warehouse", scope.warehouse],
    ["Movement count", rows.length],
    ["Exported (Asia/Manila)", new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })],
    ["Note", "Only Counted rows change stock. Voided entries and pending deliveries are listed for the record."],
  ]);
  details.getColumn(1).width = 26;
  details.getColumn(2).width = 90;

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `stock-movements-${new Date().toISOString().split("T")[0]}.xlsx`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

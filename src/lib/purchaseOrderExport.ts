import type { PurchaseOrderSummary } from "@/types/purchaseOrder";

export async function exportPurchaseOrders(
  orders: PurchaseOrderSummary[],
  filters: { search: string; status: string },
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Purchase Orders");
  summary.addRow(["PO No.", "Date", "Supplier", "PR No.", "Status", "Total Amount (PHP)", "Prepared By", "Approved By", "Noted By", "Delivery Date", "Payment Terms", "Comments"]);
  const items = workbook.addWorksheet("Line Items");
  items.addRow(["PO No.", "Supplier", "Item No.", "Product Code", "Description", "Quantity", "Unit", "Unit Price (PHP)", "Amount (PHP)"]);
  for (const order of orders) {
    summary.addRow([order.poNumber, order.date, order.supplierName, order.prNumber || "", order.status || "created", order.totalAmount, order.preparedBy, order.approvedBy || "", order.notedBy || "", order.deliveryDate || "", order.paymentTerms || "", order.comments || ""]);
    for (const item of order.items ?? []) {
      items.addRow([order.poNumber, order.supplierName, item.itemNo, item.productCode || "", item.description, item.quantity, item.unit, item.pricePerUnit, item.totalAmount]);
    }
  }
  for (const sheet of [summary, items]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
    sheet.columns.forEach((column) => { column.width = 24; });
  }
  summary.getColumn(3).width = 40;
  summary.getColumn(12).width = 50;
  summary.getColumn(6).numFmt = '#,##0.00';
  items.getColumn(5).width = 60;
  items.getColumn(6).numFmt = '#,##0.####';
  items.getColumn(8).numFmt = '#,##0.00';
  items.getColumn(9).numFmt = '#,##0.00';
  const metadata = workbook.addWorksheet("Export Details");
  metadata.addRows([
    ["Search", filters.search || "All"],
    ["Status", filters.status],
    ["Order count", orders.length],
    ["Exported (Asia/Manila)", new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })],
    ["Scope", "All matching orders across table pages; amounts include the selected statuses."],
  ]);
  metadata.getColumn(1).width = 28;
  metadata.getColumn(2).width = 90;
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "purchase-orders-filtered.xlsx";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

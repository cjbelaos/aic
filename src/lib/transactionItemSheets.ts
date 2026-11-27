import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isPostgresBackend } from "@/lib/db/postgres";
import { col, ref, sheetRows } from "@/lib/db/sheetRows";
import { isMissingSheetError, parseSheetNumber } from "@/lib/sheets.utils";
import type { PurchaseOrderItem } from "@/types/purchaseOrder";
import type { DeliveryItem } from "@/types/deliveryReceipt";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";
import { deliveryItemRowValues, parseDeliveryItemRow, serialCellValue, type SerialUpdate } from "@/lib/deliverySerials";

// PO line items live in the canonical `PurchaseOrderItems` tab and DR line items
// live in the canonical `DeliveryReceiptItems` tab; both follow the unified schema.
const PO_SHEET = "PurchaseOrderItems";
const DR_SHEET = "DeliveryReceiptItems";

export async function getPurchaseOrderItems(): Promise<Map<string, PurchaseOrderItem[]>> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PO_SHEET}!A2:I` });
    const result = new Map<string, PurchaseOrderItem[]>();
    for (const row of response.data.values ?? []) {
      const po = String(row[0] ?? "").trim(); if (!po) continue;
      const item: PurchaseOrderItem = { purchaseOrderId: po, itemNo: Number(row[1]) || 0,
        supplierProductId: String(row[2] ?? "") || undefined, productId: String(row[3] ?? "") || undefined,
        description: String(row[4] ?? ""), quantity: Number(row[5]) || 0, unit: String(row[6] ?? ""),
        pricePerUnit: parseSheetNumber(row[7]), totalAmount: parseSheetNumber(row[8]) };
      result.set(po, [...(result.get(po) ?? []), item]);
    }
    return result;
  } catch (error) { if (isMissingSheetError(error)) return new Map(); throw error; }
}

export async function replacePurchaseOrderItems(poNumber: string, items: PurchaseOrderItem[]): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PO_SHEET}!A2:I` }).catch(() => ({ data: { values: [] } }));
  const rows = existing.data.values ?? [];
  const updates = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => String(row[0] ?? "") === poNumber);
  await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: PO_SHEET, columnCount: 9, existingRows: updates, values: items.map((item, index) => [poNumber, index + 1, item.supplierProductId ?? "", item.productId ?? "", item.description, item.quantity, item.unit, item.pricePerUnit, item.totalAmount]) });
}

/** Repoints existing PO item rows when a draft PO is finalized. */
export async function renamePurchaseOrderItemReferences(fromPONumber: string, toPONumber: string): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PO_SHEET}!A2:A` }).catch(() => ({ data: { values: [] } }));
  const rows = (existing.data.values ?? []).map((row, index) => ({ value: String(row[0] ?? "").trim(), rowNumber: index + 2 })).filter((row) => row.value === fromPONumber);
  if (!rows.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: rows.map(({ rowNumber }) => ({ range: `${PO_SHEET}!A${rowNumber}`, values: [[toPONumber]] })) } });
}

export async function getDeliveryItems(): Promise<Map<number, DeliveryItem[]>> {
  try {
    const rows = isPostgresBackend()
      ? await sheetRows("aic.delivery_receipt_items", [col("dr_number"), col("item_no"), ref("product_id", "ProductId"), col("product_code_snapshot"), col("description_snapshot"), col("quantity"), col("unit_snapshot"), col("status"), col("delivery_receipt_item_id"), ref("sales_order_item_id", "SalesOrderItemId"), col("serial_numbers"), col("warehouse_sources")])
      : (await (await getSheetsClient()).spreadsheets.values.get({ spreadsheetId: await getDatabaseSpreadsheetId(), range: `${DR_SHEET}!A2:L` })).data.values;
    const result = new Map<number, DeliveryItem[]>();
    for (const row of rows ?? []) { const { drNumber: dr, status, item } = parseDeliveryItemRow(row); if (!dr || status === "deleted") continue;
      result.set(dr, [...(result.get(dr) ?? []), item]); }
    return result;
  } catch (error) { if (isMissingSheetError(error)) return new Map(); throw error; }
}

export async function replaceDeliveryItems(drNumber: number, items: DeliveryItem[]): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DR_SHEET}!A2:L` }).catch(() => ({ data: { values: [] } })); const rows = existing.data.values ?? [];
  const matches = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => Number(row[0]) === drNumber);
  await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: DR_SHEET, columnCount: 12, existingRows: matches, values: items.map((item, index) => deliveryItemRowValues(drNumber, index, item)) });
}

/** Repoints existing item rows when a draft DR is finalized to a real DR number. */
export async function renameDeliveryItemReferences(fromDrNumber: number, toDrNumber: number): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DR_SHEET}!A2:A` }).catch(() => ({ data: { values: [] } }));
  const rows = (existing.data.values ?? []).map((row, index) => ({ value: Number(row[0]), rowNumber: index + 2 })).filter((row) => row.value === fromDrNumber);
  if (!rows.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: rows.map(({ rowNumber }) => ({ range: `${DR_SHEET}!A${rowNumber}`, values: [[toDrNumber]] })) } });
}

/** Writes only column K (serials) for the given active item rows of one DR. */
export async function updateDeliveryItemSerials(drNumber: number, updates: SerialUpdate[]): Promise<void> {
  if (!updates.length) return;
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DR_SHEET}!A2:L` });
  const rowById = new Map<string, number>();
  (existing.data.values ?? []).forEach((row, index) => {
    const parsed = parseDeliveryItemRow(row);
    if (parsed.drNumber === drNumber && parsed.status !== "deleted" && parsed.item.deliveryReceiptItemId) rowById.set(parsed.item.deliveryReceiptItemId, index + 2);
  });
  const data = updates.map((update) => {
    const rowNumber = rowById.get(update.deliveryReceiptItemId);
    if (!rowNumber) throw new Error(`Delivery line ${update.deliveryReceiptItemId} was not found on DR #${drNumber}.`);
    return { range: `${DR_SHEET}!K${rowNumber}`, values: [[serialCellValue(update.serialNumbers)]] };
  });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
}

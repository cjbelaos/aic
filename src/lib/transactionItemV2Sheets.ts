import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isMissingSheetError, parseSheetNumber } from "@/lib/v2Sheets.utils";
import type { PurchaseOrderItem } from "@/types/purchaseOrder";
import type { DeliveryItem } from "@/types/deliveryReceipt";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";

const PO_SHEET = "PurchaseOrderItemsV2";
const DR_SHEET = "DeliveryReceiptItemsV2";

export async function getPurchaseOrderItemsV2(): Promise<Map<string, PurchaseOrderItem[]>> {
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

export async function replacePurchaseOrderItemsV2(poNumber: string, items: PurchaseOrderItem[]): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PO_SHEET}!A2:I` }).catch(() => ({ data: { values: [] } }));
  const rows = existing.data.values ?? [];
  const updates = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => String(row[0] ?? "") === poNumber);
  await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: PO_SHEET, columnCount: 9, existingRows: updates, values: items.map((item, index) => [poNumber, index + 1, item.supplierProductId ?? "", item.productId ?? "", item.description, item.quantity, item.unit, item.pricePerUnit, item.totalAmount]) });
}

/** Repoints existing V2 item rows when a draft PO is finalized. */
export async function renamePurchaseOrderItemReferencesV2(fromPONumber: string, toPONumber: string): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PO_SHEET}!A2:A` }).catch(() => ({ data: { values: [] } }));
  const rows = (existing.data.values ?? []).map((row, index) => ({ value: String(row[0] ?? "").trim(), rowNumber: index + 2 })).filter((row) => row.value === fromPONumber);
  if (!rows.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: rows.map(({ rowNumber }) => ({ range: `${PO_SHEET}!A${rowNumber}`, values: [[toPONumber]] })) } });
}

export async function getDeliveryItemsV2(): Promise<Map<number, DeliveryItem[]>> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DR_SHEET}!A2:H` }); const result = new Map<number, DeliveryItem[]>();
    for (const row of response.data.values ?? []) { const dr = Number(row[0]); if (!dr || String(row[7] ?? "active") === "deleted") continue;
      const item: DeliveryItem = { productId: String(row[2] ?? "") || undefined, productCode: String(row[3] ?? ""), description: String(row[4] ?? ""), quantity: Number(row[5]) || 0, unit: String(row[6] ?? "") };
      result.set(dr, [...(result.get(dr) ?? []), item]); }
    return result;
  } catch (error) { if (isMissingSheetError(error)) return new Map(); throw error; }
}

export async function replaceDeliveryItemsV2(drNumber: number, items: DeliveryItem[]): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DR_SHEET}!A2:H` }).catch(() => ({ data: { values: [] } })); const rows = existing.data.values ?? [];
  const matches = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => Number(row[0]) === drNumber);
  await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: DR_SHEET, columnCount: 8, existingRows: matches, values: items.map((item, index) => [drNumber, index + 1, item.productId ?? "", item.productCode, item.description, item.quantity, item.unit, "active"]) });
}

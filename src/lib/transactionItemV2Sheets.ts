import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isMissingSheetError, parseSheetNumber } from "@/lib/v2Sheets.utils";
import type { PurchaseOrderItem } from "@/types/purchaseOrder";
import type { DeliveryItem } from "@/types/deliveryReceipt";

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
  if (updates.length) await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: updates.map(({ rowNumber }) => `${PO_SHEET}!A${rowNumber}:I${rowNumber}`) } });
  if (items.length) await sheets.spreadsheets.values.append({ spreadsheetId, range: `${PO_SHEET}!A2:I`, valueInputOption: "USER_ENTERED", requestBody: { values: items.map((item) => [poNumber, item.itemNo, item.supplierProductId ?? "", item.productId ?? "", item.description, item.quantity, item.unit, item.pricePerUnit, item.totalAmount]) } });
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
  if (matches.length) await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: matches.map(({ rowNumber }) => `${DR_SHEET}!A${rowNumber}:H${rowNumber}`) } });
  if (items.length) await sheets.spreadsheets.values.append({ spreadsheetId, range: `${DR_SHEET}!A2:H`, valueInputOption: "USER_ENTERED", requestBody: { values: items.map((item, index) => [drNumber, index + 1, item.productId ?? "", item.productCode, item.description, item.quantity, item.unit, "active"]) } });
}

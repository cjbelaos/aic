import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getCustomers } from "@/lib/companySheets";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
} from "@/types/delivery";

const DELIVERED_BY_NAMES_SHEET = "DeliveredByNames";
const DELIVERED_BY_NAMES_RANGE = `${DELIVERED_BY_NAMES_SHEET}!A2:A`;

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";
const DELIVERY_RECEIPTS_RANGE = `${DELIVERY_RECEIPTS_SHEET}!A2:L`; // Columns: A: DRNumber, B: DeliveryDate, C: CompanyId, D: PONumber, E: TRNumber, F: ProductCode, G: Quantity, H: Unit, I: Comments, J: PreparedBy, K: DeliveredBy, L: CreatedAt

// Google Sheet tab specifically configured for printing delivery receipts
const PRINT_TEMPLATE_SHEET = "DELIVERY TRACKER";

/**
 * Fetches personnel names from the DeliveredByNames sheet.
 */
export async function getDriversFromSheets(): Promise<string[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: DELIVERED_BY_NAMES_RANGE,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row) => row[0]).filter(Boolean);
  } catch (error) {
    console.error("Failed to fetch drivers from Google Sheets:", error);
    throw error;
  }
}

/**
 * Process new delivery receipt:
 * 1. Fetches next DR Number.
 * 2. Fetches company details (Address, TIN) from Companies sheet.
 * 3. Appends transaction history to the DeliveryReceipts sheet.
 * 4. Populates the printable "DELIVERY TRACKER" template cells.
 * 5. Returns DR metadata and printable Google Sheets export link.
 */
export async function processDeliveryReceipt(
  payload: CreateDeliveryPayload,
): Promise<DeliveryReceiptResponse> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Calculate DR Number from existing receipts count
    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: DELIVERY_RECEIPTS_RANGE,
    });
    const existingRows = existingResponse.data.values || [];
    const nextDrNumber = 3600 + existingRows.length + 1; // Base starting DR#

    // 2. Fetch customer details for template populating
    const customers = await getCustomers();
    const customer = customers.find(
      (c) =>
        c.companyName?.trim().toLowerCase() ===
        payload.companyName.trim().toLowerCase(),
    );

    const address = customer?.address || "";
    const tin = customer?.tin || "";

    // 3. Prepare rows for audit log in DeliveryReceipts sheet
    const createdAt = new Date().toISOString();
    const historyRows = payload.items.map((item) => [
      nextDrNumber,
      payload.date,
      payload.companyName,
      payload.poNo || "",
      payload.trNo || "",
      item.productCode,
      item.quantity,
      item.unit,
      payload.comments || "",
      "System Admin", // PreparedBy
      payload.deliveredBy || "",
      createdAt,
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: DELIVERY_RECEIPTS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: historyRows },
    });

    // 4. Populate Template Sheet Cells
    // Reset/clear item rows (A13:D35)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${PRINT_TEMPLATE_SHEET}!A13:D35`,
    });

    // Format item array: [[QTY, UNIT, DESCRIPTION]]
    const templateItemRows = payload.items.map((item) => [
      item.quantity,
      item.unit,
      item.description,
    ]);

    // Batch update template input cells
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          // Header & Customer Information
          { range: `${PRINT_TEMPLATE_SHEET}!F6`, values: [[nextDrNumber]] },
          {
            range: `${PRINT_TEMPLATE_SHEET}!B9`,
            values: [[payload.companyName]],
          },
          { range: `${PRINT_TEMPLATE_SHEET}!B10`, values: [[address]] },
          { range: `${PRINT_TEMPLATE_SHEET}!B11`, values: [[tin]] },
          { range: `${PRINT_TEMPLATE_SHEET}!E9`, values: [[payload.date]] },
          {
            range: `${PRINT_TEMPLATE_SHEET}!E10`,
            values: [[payload.poNo || ""]],
          },
          {
            range: `${PRINT_TEMPLATE_SHEET}!E11`,
            values: [[payload.trNo || ""]],
          },

          // Product Line Items (starts at A13)
          {
            range: `${PRINT_TEMPLATE_SHEET}!A13:C${12 + templateItemRows.length}`,
            values: templateItemRows,
          },

          // Instructions & Signatures
          {
            range: `${PRINT_TEMPLATE_SHEET}!A38`,
            values: [[payload.comments || ""]],
          },
          {
            range: `${PRINT_TEMPLATE_SHEET}!A47`,
            values: [[payload.deliveredBy || ""]],
          },
        ],
      },
    });

    // Direct PDF print/export link for Google Sheets
    const printUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&portrait=true&size=letter&gridlines=false&gid=1763114509`;

    return {
      success: true,
      drNumber: nextDrNumber,
      printUrl,
    };
  } catch (error) {
    console.error(
      "Failed to process delivery receipt in Google Sheets:",
      error,
    );
    throw error;
  }
}

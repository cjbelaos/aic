import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Supplier,
  CreateSupplierPayload,
  UpdateSupplierPayload,
} from "@/types/supplier";

const SUPPLIERS_SHEET = "Suppliers";
const SUPPLIERS_RANGE = `${SUPPLIERS_SHEET}!A2:E`; // A: supplierName, B: tin, C: address, D: isActive, E: status

/**
 * Utility helper to extract the raw Excel/Google Sheets row number from our custom string ID.
 * Example: "supp_5" -> 5
 */
function getRowFromId(id: string): number {
  const rowStr = id.replace("supp_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Supplier ID format: ${id}`);
  }
  return rowNum;
}

/**
 * GET: Fetches all rows mapped to Supplier items from the Google Sheet
 */
export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SUPPLIERS_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): Supplier => {
      return {
        id: `supp_${index + 2}`,
        supplierName: row[0] || "",
        tin: row[1] || "",
        address: row[2] || "",
        isActive:
          row[3] !== undefined
            ? row[3] === "TRUE" || row[3] === "Active"
            : true,
      };
    });
  } catch (error) {
    console.error("Failed to fetch suppliers from Google Sheets:", error);
    throw error;
  }
}

/**
 * POST: Appends a new supplier row in the Google Sheet
 */
export async function addSupplier(
  payload: CreateSupplierPayload,
): Promise<Supplier> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Fetch existing rows to calculate our clean predictable new sequential row boundary
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SUPPLIERS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    // Serialize into sequential array structure matching sheet column positioning
    const newRowValues = [
      payload.supplierName || "",
      payload.tin || "",
      payload.address || "",
      payload.isActive ? "Active" : "Inactive",
    ];

    // Write the new data values cleanly into the appended targeted row context
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SUPPLIERS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `supp_${newRowNumber}`,
      supplierName: payload.supplierName,
      tin: payload.tin || "",
      address: payload.address || "",
      isActive: payload.isActive,
    };
  } catch (error) {
    console.error(`Failed to create supplier row in Google Sheets:`, error);
    throw error;
  }
}

/**
 * PUT / UPDATE: Updates an existing supplier row in the Google Sheet
 */
export async function updateSupplierInSheets(
  payload: UpdateSupplierPayload,
): Promise<Supplier> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${SUPPLIERS_SHEET}!A${rowNumber}:D${rowNumber}`;

    // First, fetch the current row so we don't accidentally overwrite skipped partial fields
    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    // Map payload updates over old values, maintaining structural array index positioning
    const updatedValues = [
      payload.supplierName !== undefined
        ? payload.supplierName
        : existingRow[0] || "",
      payload.tin !== undefined ? payload.tin : existingRow[1] || "",
      payload.address !== undefined ? payload.address : existingRow[2] || "",
      payload.isActive !== undefined
        ? payload.isActive
          ? "Active"
          : "Inactive"
        : existingRow[3] || "Active",
    ];

    // Write the updated array back into the targeted row range
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [updatedValues],
      },
    });

    return {
      id: payload.id,
      supplierName: updatedValues[0],
      tin: updatedValues[1],
      address: updatedValues[2],
      isActive: updatedValues[3] === "Active",
    };
  } catch (error) {
    console.error(
      `Failed to update supplier row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

/**
 * DELETE: Clears the contents of a supplier row from the Google Sheet
 */
export async function deleteSupplierFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${SUPPLIERS_SHEET}!A${rowNumber}:D${rowNumber}`;

    // Clears the text values inside the targeted line range cells
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear supplier row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

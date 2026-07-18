import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  ProductUnit,
  CreateProductUnitPayload,
  UpdateProductUnitPayload,
} from "@/types/product-unit";

const PRODUCT_UNITS_SHEET = "ProductUnits";
const PRODUCT_UNITS_RANGE = `${PRODUCT_UNITS_SHEET}!A2:C`; // Covers columns A to C

/**
 * Utility helper to extract the raw Excel/Google Sheets row number from our custom string ID.
 * Example: "unit_5" -> 5
 */
function getRowFromId(id: string): number {
  const rowStr = id.replace("unit_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Product Unit ID format: ${id}`);
  }
  return rowNum;
}

/**
 * GET: Fetches all rows mapped to Product Unit items from the Google Sheet
 */
export async function getProductUnits(): Promise<ProductUnit[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCT_UNITS_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): ProductUnit => {
      return {
        id: `unit_${index + 2}`,
        code: row[0] || "",
        name: row[1] || "",
      };
    });
  } catch (error) {
    console.error("Failed to fetch product units from Google Sheets:", error);
    throw error;
  }
}

/**
 * POST: Appends a new product unit row in the Google Sheet
 */
export async function addProductUnit(
  payload: CreateProductUnitPayload,
): Promise<ProductUnit> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Fetch existing rows to calculate our clean predictable new sequential row boundary
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCT_UNITS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    // Fixed: Serialize directly into sequential array structure matching sheet column positioning
    const newRowValues = [payload.code || "", payload.name || ""];

    // Write the new data values cleanly into the appended targeted row context
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: PRODUCT_UNITS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `unit_${newRowNumber}`,
      code: payload.code,
      name: payload.name,
    };
  } catch (error) {
    console.error(`Failed to create product unit row in Google Sheets:`, error);
    throw error;
  }
}

/**
 * PUT / UPDATE: Updates an existing product unit row in the Google Sheet
 */
export async function updateProductUnit(
  payload: UpdateProductUnitPayload,
): Promise<ProductUnit> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${PRODUCT_UNITS_SHEET}!A${rowNumber}:C${rowNumber}`;

    // First, fetch the current row so we don't accidentally overwrite skipped partial fields
    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    // Map payload updates over old values, maintaining structural array index positioning
    const updatedValues = [
      payload.name !== undefined ? payload.name : existingRow[0] || "",
      (payload as any).code !== undefined
        ? (payload as any).code
        : existingRow[1] || "",
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
      name: updatedValues[0],
      code: updatedValues[1],
    } as ProductUnit;
  } catch (error) {
    console.error(
      `Failed to update product unit row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

/**
 * DELETE: Clears the contents of a product unit row from the Google Sheet
 */
export async function deleteProductUnit(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${PRODUCT_UNITS_SHEET}!A${rowNumber}:C${rowNumber}`;

    // Clears the text values inside the targeted line range cells
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear product unit row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  ProductCategory,
  CreateProductCategoryPayload,
  UpdateProductCategoryPayload,
} from "@/types/product-category";

const CATEGORIES_SHEET = "ProductCategories"; // Assumes a sheet tab named "ProductCategories" exists
const CATEGORIES_RANGE = `${CATEGORIES_SHEET}!A2:Z`; // Covers columns A (code), B (name)

/**
 * Utility helper to extract the raw Excel/Google Sheets row number from our custom string ID.
 * Example: "pc_3" -> 3
 */
function getRowFromId(id: string): number {
  const rowStr = id.replace("pc_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid ProductCategory ID format: ${id}`);
  }
  return rowNum;
}

/**
 * GET: Fetches all rows mapped to ProductCategory items from the Google Sheet.
 */
export async function getProductCategories(): Promise<ProductCategory[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CATEGORIES_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): ProductCategory => {
      return {
        id: `pc_${index + 2}`, // Matches row index position + offset (row 1 = header)
        code: row[0] || "",
        name: row[1] || "",
      };
    });
  } catch (error) {
    console.error(
      "Failed to fetch product categories from Google Sheets:",
      error,
    );
    throw error;
  }
}

/**
 * POST: Appends a new product category row in the Google Sheet.
 */
export async function addProductCategory(
  payload: CreateProductCategoryPayload,
): Promise<ProductCategory> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Fetch existing rows to calculate the new row boundary
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CATEGORIES_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    // Serialize into column array matching sheet layout: [code, name]
    const newRowValues = [payload.code || "", payload.name || ""];

    // Append the new row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: CATEGORIES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `pc_${newRowNumber}`,
      code: payload.code,
      name: payload.name,
    };
  } catch (error) {
    console.error("Failed to create product category in Google Sheets:", error);
    throw error;
  }
}

/**
 * PUT / UPDATE: Updates an existing product category row in the Google Sheet.
 */
export async function updateProductCategoryInSheets(
  payload: UpdateProductCategoryPayload,
): Promise<ProductCategory> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${CATEGORIES_SHEET}!A${rowNumber}:B${rowNumber}`;

    // Fetch the current row so we don't accidentally overwrite skipped partial fields
    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    // Map payload updates over old values
    const updatedValues = [
      payload.code !== undefined ? payload.code : existingRow[0] || "",
      payload.name !== undefined ? payload.name : existingRow[1] || "",
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
      code: String(updatedValues[0]),
      name: String(updatedValues[1]),
    };
  } catch (error) {
    console.error(
      `Failed to update product category row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

/**
 * DELETE: Clears the contents of a product category row from the Google Sheet.
 */
export async function deleteProductCategoryFromSheets(
  id: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${CATEGORIES_SHEET}!A${rowNumber}:B${rowNumber}`;

    // Clears the text values inside the targeted line range cells
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear product category row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

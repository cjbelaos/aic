import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  CustomerPrice,
  CreateCustomerPricePayload,
  UpdateCustomerPricePayload,
} from "@/types/customer-price";

const CUSTOMER_PRICES_SHEET = "CustomerPrices"; // Assumes a sheet tab named "CustomerPrices" exists
const CUSTOMER_PRICES_RANGE = `${CUSTOMER_PRICES_SHEET}!A2:Z`; // Covers columns A (customerName), B (productCode), C (pricePerUnit)

/**
 * Utility helper to extract the raw Excel/Google Sheets row number from our custom string ID.
 * Example: "cp_5" -> 5
 */
function getRowFromId(id: string): number {
  const rowStr = id.replace("cp_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid CustomerPrice ID format: ${id}`);
  }
  return rowNum;
}

/**
 * GET: Fetches all rows mapped to CustomerPrice items from the Google Sheet.
 */
export async function getCustomerPrices(): Promise<CustomerPrice[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CUSTOMER_PRICES_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): CustomerPrice => {
      return {
        id: `cp_${index + 2}`, // Matches row index position + offset (row 1 = header)
        customerName: row[0] || "",
        productCode: row[1] || "",
        pricePerUnit:
          parseFloat(String(row[2] || "0").replace(/[₱$,]/g, "")) || 0,
      };
    });
  } catch (error) {
    console.error("Failed to fetch customer prices from Google Sheets:", error);
    throw error;
  }
}

/**
 * POST: Appends a new customer price row in the Google Sheet.
 * Before appending, validates that the composite key (customerName, productCode)
 * is unique and that the referenced customer/product exist.
 */
export async function addCustomerPrice(
  payload: CreateCustomerPricePayload,
): Promise<CustomerPrice> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Fetch existing rows to check for duplicate composite key
    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CUSTOMER_PRICES_RANGE,
    });
    const existingRows = existingResponse.data.values || [];

    // Validate composite unique constraint
    const duplicate = existingRows.find(
      (row) =>
        row[0]?.trim().toLowerCase() ===
          payload.customerName.trim().toLowerCase() &&
        row[1]?.trim().toLowerCase() ===
          payload.productCode.trim().toLowerCase(),
    );
    if (duplicate) {
      throw new Error(
        `A custom price already exists for customer "${payload.customerName}" and product "${payload.productCode}".`,
      );
    }

    // 2. Validate pricePerUnit > 0
    if (payload.pricePerUnit <= 0) {
      throw new Error(
        "Custom Price/Unit must be a positive number greater than 0.",
      );
    }

    // 3. Calculate new row number
    const rowCount = existingRows.length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    // Serialize into column array matching sheet layout: [customerName, productCode, pricePerUnit]
    const newRowValues = [
      payload.customerName || "",
      payload.productCode || "",
      payload.pricePerUnit || 0,
    ];

    // Append the new row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: CUSTOMER_PRICES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `cp_${newRowNumber}`,
      customerName: payload.customerName,
      productCode: payload.productCode,
      pricePerUnit: payload.pricePerUnit,
    };
  } catch (error) {
    console.error("Failed to create customer price in Google Sheets:", error);
    throw error;
  }
}

/**
 * PUT / UPDATE: Updates an existing customer price row in the Google Sheet.
 */
export async function updateCustomerPriceInSheets(
  payload: UpdateCustomerPricePayload,
): Promise<CustomerPrice> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${CUSTOMER_PRICES_SHEET}!A${rowNumber}:C${rowNumber}`;

    // Fetch the current row so we don't accidentally overwrite skipped partial fields
    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    // Validate pricePerUnit if being updated
    const newPrice =
      payload.pricePerUnit !== undefined
        ? payload.pricePerUnit
        : parseFloat(String(existingRow[2] || "0").replace(/[₱$,]/g, "")) || 0;
    if (newPrice <= 0) {
      throw new Error(
        "Custom Price/Unit must be a positive number greater than 0.",
      );
    }

    // Map payload updates over old values
    const updatedValues = [
      payload.customerName !== undefined
        ? payload.customerName
        : existingRow[0] || "",
      payload.productCode !== undefined
        ? payload.productCode
        : existingRow[1] || "",
      newPrice,
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
      customerName: String(updatedValues[0]),
      productCode: String(updatedValues[1]),
      pricePerUnit: Number(updatedValues[2]),
    };
  } catch (error) {
    console.error(
      `Failed to update customer price row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

/**
 * DELETE: Clears the contents of a customer price row from the Google Sheet.
 */
export async function deleteCustomerPriceFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${CUSTOMER_PRICES_SHEET}!A${rowNumber}:C${rowNumber}`;

    // Clears the text values inside the targeted line range cells
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear customer price row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Customer,
  CreateCustomerPayload,
  UpdateCustomerPayload,
} from "@/types/customer";

const CUSTOMERS_SHEET = "Customers";
const CUSTOMERS_RANGE = `${CUSTOMERS_SHEET}!A2:G`; // Covers columns A to G

/**
 * Utility helper to extract the raw Excel/Google Sheets row number from our custom string ID.
 * Example: "cust_5" -> 5
 */
function getRowFromId(id: string): number {
  const rowStr = id.replace("cust_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Customer ID format: ${id}`);
  }
  return rowNum;
}

/**
 * GET: Fetches all rows mapped to Customer items from the Google Sheet
 */
export async function getCustomers(): Promise<Customer[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CUSTOMERS_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): Customer => {
      return {
        id: `cust_${index + 2}`, // Matches row index position + offset
        customerName: row[0] || "",
        contactPerson: row[1] || "",
        contactNumber: row[2] || "",
        email: row[3] || "",
        tin: row[4] || "",
        address: row[5] || "",
      };
    });
  } catch (error) {
    console.error("Failed to fetch customers from Google Sheets:", error);
    throw error;
  }
}

/**
 * POST: Appends a new supplier row in the Google Sheet
 */
export async function addCustomer(
  payload: CreateCustomerPayload,
): Promise<Customer> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Fetch existing rows to calculate our clean predictable new sequential row boundary
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CUSTOMERS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    // Serialize into sequential array structure matching sheet column positioning
    const newRowValues = [
      payload.customerName || "",
      payload.contactPerson || "",
      payload.contactNumber || "",
      payload.email || "",
      payload.tin || "",
      payload.address || "",
    ];

    // Write the new data values cleanly into the appended targeted row context
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: CUSTOMERS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `cust_${newRowNumber}`,
      customerName: payload.customerName,
      contactPerson: payload.contactPerson || "",
      contactNumber: payload.contactNumber || "",
      email: payload.email,
      tin: payload.tin || "",
      address: payload.address || "",
    };
  } catch (error) {
    console.error(`Failed to create supplier row in Google Sheets:`, error);
    throw error;
  }
}

/**
 * PUT / UPDATE: Updates an existing customer row in the Google Sheet
 */
export async function updateCustomerInSheets(
  payload: UpdateCustomerPayload,
): Promise<Customer> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${CUSTOMERS_SHEET}!A${rowNumber}:G${rowNumber}`;

    // First, fetch the current row so we don't accidentally overwrite skipped partial fields
    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    // Map payload updates over old values, maintaining structural array index positioning
    const updatedValues = [
      payload.customerName !== undefined
        ? payload.customerName
        : existingRow[0] || "",
      payload.contactPerson !== undefined
        ? payload.contactPerson
        : existingRow[1] || "",
      payload.contactNumber !== undefined
        ? payload.contactNumber
        : existingRow[2] || "",
      payload.email !== undefined ? payload.email : existingRow[3] || "",
      payload.tin !== undefined ? payload.tin : existingRow[4] || "",
      payload.address !== undefined ? payload.address : existingRow[5] || "",
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
      customerName: updatedValues[0],
      contactPerson: updatedValues[1],
      contactNumber: updatedValues[2],
      email: updatedValues[3],
      tin: updatedValues[4],
      address: updatedValues[5],
    };
  } catch (error) {
    console.error(
      `Failed to update customer row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

/**
 * DELETE: Clears the contents of a customer row from the Google Sheet
 */
export async function deleteCustomerFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${CUSTOMERS_SHEET}!A${rowNumber}:G${rowNumber}`;

    // Clears the text values inside the targeted line range cells
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear customer row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

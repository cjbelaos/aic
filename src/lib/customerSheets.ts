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
        companyName: row[1] || "",
        contactPerson: row[2] || "",
        contactNumber: row[3] || "",
        email: row[4] || "",
        tin: row[5] || "",
        address: row[6] || "",
      };
    });
  } catch (error) {
    console.error("Failed to fetch customers from Google Sheets:", error);
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
      payload.companyName !== undefined
        ? payload.companyName
        : existingRow[1] || "",
      payload.contactPerson !== undefined
        ? payload.contactPerson
        : existingRow[2] || "",
      payload.contactNumber !== undefined
        ? payload.contactNumber
        : existingRow[3] || "",
      payload.email !== undefined ? payload.email : existingRow[4] || "",
      payload.tin !== undefined ? payload.tin : existingRow[5] || "",
      payload.address !== undefined ? payload.address : existingRow[6] || "",
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
      companyName: updatedValues[1],
      contactPerson: updatedValues[2],
      contactNumber: updatedValues[3],
      email: updatedValues[4],
      tin: updatedValues[5],
      address: updatedValues[6],
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

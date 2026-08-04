import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  SupplierContact,
  CreateSupplierContactPayload,
  UpdateSupplierContactPayload,
} from "@/types/supplierContact";

const CONTACTS_SHEET = "Supplier Contacts";
const CONTACTS_RANGE = `${CONTACTS_SHEET}!A2:F`; // A:contactId, B: supplierId, C: fullName, D: email, E: phone, F: isPrimary

function getRowFromId(id: string): number {
  const rowStr = id.replace("cont_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Supplier Contact ID format: ${id}`);
  }
  return rowNum;
}

function parseIsPrimary(value: string | undefined): boolean {
  if (value === undefined || value === "") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1" || v === "primary";
}

export async function getSupplierContacts(): Promise<SupplierContact[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): SupplierContact => {
      return {
        id: `cont_${index + 2}`,
        contactId: row[0] || "",
        supplierId: row[1] || "",
        fullName: row[2] || "",
        email: row[3] || "",
        phone: row[4] || "",
        isPrimary: parseIsPrimary(row[5]),
      };
    });
  } catch (error) {
    console.error(
      "Failed to fetch supplier contacts from Google Sheets:",
      error,
    );
    throw error;
  }
}

export async function getSupplierContactsBySupplier(
  supplierId: string,
): Promise<SupplierContact[]> {
  const all = await getSupplierContacts();
  return all.filter((c) => c.supplierId === supplierId);
}

export async function addSupplierContact(
  payload: CreateSupplierContactPayload,
): Promise<SupplierContact> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2;

    const newRowValues = [
      payload.contactId || "",
      payload.supplierId || "",
      payload.fullName || "",
      payload.email || "",
      payload.phone || "",
      payload.isPrimary ? "TRUE" : "FALSE",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: CONTACTS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `cont_${newRowNumber}`,
      contactId: payload.contactId || "",
      supplierId: payload.supplierId || "",
      fullName: payload.fullName,
      email: payload.email || "",
      phone: payload.phone || "",
      isPrimary: payload.isPrimary,
    };
  } catch (error) {
    console.error(
      `Failed to create supplier contact row in Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function updateSupplierContactInSheets(
  payload: UpdateSupplierContactPayload,
): Promise<SupplierContact> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${CONTACTS_SHEET}!A${rowNumber}:F${rowNumber}`;

    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    const updatedValues = [
      payload.contactId !== undefined
        ? payload.contactId
        : existingRow[0] || "",
      payload.supplierId !== undefined
        ? payload.supplierId
        : existingRow[1] || "",
      payload.fullName !== undefined ? payload.fullName : existingRow[2] || "",
      payload.email !== undefined ? payload.email : existingRow[3] || "",
      payload.phone !== undefined ? payload.phone : existingRow[4] || "",
      payload.isPrimary !== undefined
        ? payload.isPrimary
          ? "TRUE"
          : "FALSE"
        : existingRow[5] || "FALSE",
    ];

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
      contactId: updatedValues[0],
      supplierId: updatedValues[1],
      fullName: updatedValues[2],
      email: updatedValues[3],
      phone: updatedValues[4],
      isPrimary: parseIsPrimary(updatedValues[5]),
    };
  } catch (error) {
    console.error(
      `Failed to update supplier contact row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function deleteSupplierContactFromSheets(
  id: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${CONTACTS_SHEET}!A${rowNumber}:F${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear supplier contact row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  CompanyContact,
  CreateCompanyContactPayload,
  UpdateCompanyContactPayload,
} from "@/types/companyContact";

const CONTACTS_SHEET = "CompanyContacts";
const CONTACTS_RANGE = `${CONTACTS_SHEET}!A2:F`; // A:contactId, B:companyId, C:fullName, D:email, E:phone, F:isPrimary

function getRowFromId(id: string): number {
  const rowStr = id.replace("cont_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Company Contact ID format: ${id}`);
  }
  return rowNum;
}

function parseIsPrimary(value: string | undefined): boolean {
  if (value === undefined || value === "") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1" || v === "primary";
}

export async function getCompanyContacts(): Promise<CompanyContact[]> {
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

    return rows.map((row, index): CompanyContact => {
      return {
        id: `cont_${index + 2}`,
        contactId: row[0] || "",
        companyId: row[1] || "",
        fullName: row[2] || "",
        email: row[3] || "",
        phone: row[4] || "",
        isPrimary: parseIsPrimary(row[5]),
      };
    });
  } catch (error) {
    console.error(
      "Failed to fetch company contacts from Google Sheets:",
      error,
    );
    throw error;
  }
}

export async function getCompanyContactsByCompany(
  companyId: string,
): Promise<CompanyContact[]> {
  const all = await getCompanyContacts();
  return all.filter((c) => c.companyId === companyId);
}

export async function addCompanyContact(
  payload: CreateCompanyContactPayload,
): Promise<CompanyContact> {
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
      payload.companyId || "",
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
      companyId: payload.companyId || "",
      fullName: payload.fullName,
      email: payload.email || "",
      phone: payload.phone || "",
      isPrimary: payload.isPrimary,
    };
  } catch (error) {
    console.error(
      `Failed to create company contact row in Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function updateCompanyContactInSheets(
  payload: UpdateCompanyContactPayload,
): Promise<CompanyContact> {
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
      payload.companyId !== undefined
        ? payload.companyId
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
      companyId: updatedValues[1],
      fullName: updatedValues[2],
      email: updatedValues[3],
      phone: updatedValues[4],
      isPrimary: parseIsPrimary(updatedValues[5]),
    };
  } catch (error) {
    console.error(
      `Failed to update company contact row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

async function getSheetTabId(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  sheetName: string,
): Promise<number> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetName],
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  );
  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet.`);
  }
  return sheet.properties.sheetId;
}

export async function deleteCompanyContactFromSheets(
  id: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const sheetId = await getSheetTabId(sheets, spreadsheetId, CONTACTS_SHEET);

    // Physically remove the contact row (shift subsequent rows up).
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1, // 0-based row index
                endIndex: rowNumber, // exclusive
              },
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error(
      `Failed to delete company contact row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

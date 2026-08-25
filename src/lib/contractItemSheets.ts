//contractItemSheets.ts
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  ContractItem,
  CreateContractItemPayload,
  UpdateContractItemPayload,
  FrequencyType,
} from "@/types/contract";

const ITEMS_SHEET = "ContractItems";
const ITEMS_RANGE = `${ITEMS_SHEET}!A2:F`; // Columns: A: ItemId, B: ContractId, C: ProductCode, D: EntitledQty, E: Frequency, F: Status
const ITEMS_COLUMNS = {
  A: "ItemId",
  B: "ContractId",
  C: "ProductCode",
  D: "EntitledQty",
  E: "Frequency",
  F: "Status",
};

/**
 * GET: Fetches all line items, or filters by contractId if provided.
 */
export async function getContractItems(
  contractId?: string,
): Promise<ContractItem[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ITEMS_RANGE,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    const items: ContractItem[] = rows
      .filter((row) => row[0] && row[0].startsWith("CTI-")) // Filter out empty rows
      .map((row, index) => ({
        id: row[0] || `CTI-${String(index + 1).padStart(4, "0")}`,
        contractId: row[1] || "",
        productCode: row[2] || "",
        entitledQty: parseInt(String(row[3] || "0"), 10) || 0,
        frequency: (row[4] as FrequencyType) || "Monthly",
        status: (row[5] as "Active" | "Inactive") || "Active",
      }));

    if (contractId) {
      return items.filter((item) => item.contractId === contractId);
    }

    return items;
  } catch (error) {
    console.error("Failed to fetch contract items from Google Sheets:", error);
    throw error;
  }
}

/**
 * POST: Appends a new contract line item row.
 */
export async function addContractItem(
  payload: CreateContractItemPayload,
): Promise<ContractItem> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ITEMS_RANGE,
    });
    const existingRows = existingResponse.data.values || [];

    // Filter out empty rows and get existing IDs
    const validRows = existingRows.filter(
      (row) => row[0] && row[0].startsWith("CTI-"),
    );

    // Find the highest existing ID number
    let maxNumber = 0;
    validRows.forEach((row) => {
      const id = row[0];
      if (id && id.startsWith("CTI-")) {
        const num = parseInt(id.substring(4), 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    });

    const newItemNumber = maxNumber + 1;
    const itemId = `CTI-${String(newItemNumber).padStart(4, "0")}`;

    // Find the first empty row
    let firstEmptyRowIndex = existingRows.length;
    for (let i = 0; i < existingRows.length; i++) {
      if (
        !existingRows[i] ||
        existingRows[i].every((cell) => !cell || cell.trim() === "")
      ) {
        firstEmptyRowIndex = i;
        break;
      }
    }

    const rowNumber = firstEmptyRowIndex + 2; // +2 for header and 0-indexed
    const updateRange = `${ITEMS_SHEET}!A${rowNumber}:F${rowNumber}`;

    const newRowValues = [
      itemId,
      payload.contractId || "",
      payload.productCode || "",
      payload.entitledQty ?? 1,
      payload.frequency || "Monthly",
      payload.status || "Active",
    ];

    // Use update instead of append to ensure we fill empty rows
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRowValues] },
    });

    return {
      id: itemId,
      contractId: payload.contractId,
      productCode: payload.productCode,
      entitledQty: payload.entitledQty,
      frequency: payload.frequency,
      status: payload.status,
    };
  } catch (error) {
    console.error("Failed to create contract item in Google Sheets:", error);
    throw error;
  }
}

/**
 * PUT: Updates an existing contract line item by Item ID (`CTI-xxxx`).
 */
export async function updateContractItemInSheets(
  payload: UpdateContractItemPayload,
): Promise<ContractItem> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Read raw rows directly so row indices map 1:1 to the sheet.
    // (getContractItems filters empty rows, which shifts indices and would
    // make us write to the wrong row when gaps exist.)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ITEMS_RANGE,
    });
    const rows = response.data.values || [];

    const rowIndex = rows.findIndex((row) => row[0] === payload.id);
    if (rowIndex === -1) {
      throw new Error(`Contract item with ID ${payload.id} not found.`);
    }

    const rowNumber = rowIndex + 2; // Offset for header row
    const updateRange = `${ITEMS_SHEET}!A${rowNumber}:F${rowNumber}`;
    const existing = rows[rowIndex];

    const updatedValues = [
      existing[0] ?? payload.id,
      payload.contractId !== undefined ? payload.contractId : existing[1],
      payload.productCode !== undefined ? payload.productCode : existing[2],
      payload.entitledQty !== undefined ? payload.entitledQty : existing[3],
      payload.frequency !== undefined ? payload.frequency : existing[4],
      payload.status !== undefined ? payload.status : existing[5],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedValues] },
    });

    return {
      id: String(updatedValues[0]),
      contractId: String(updatedValues[1]),
      productCode: String(updatedValues[2]),
      entitledQty: Number(updatedValues[3]),
      frequency: updatedValues[4] as FrequencyType,
      status: updatedValues[5] as "Active" | "Inactive",
    };
  } catch (error) {
    console.error(`Failed to update contract item ${payload.id}:`, error);
    throw error;
  }
}

/**
 * DELETE: Clears a contract line item row by Item ID.
 */
export async function deleteContractItemFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Read raw rows directly so row indices map 1:1 to the sheet.
    // (getContractItems filters empty rows, which shifts indices and would
    // make us clear the wrong row when gaps exist.)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ITEMS_RANGE,
    });
    const rows = response.data.values || [];

    const rowIndex = rows.findIndex((row) => row[0] === id);
    if (rowIndex === -1) return;

    const rowNumber = rowIndex + 2;
    const deleteRange = `${ITEMS_SHEET}!A${rowNumber}:F${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(`Failed to clear contract item row ${id}:`, error);
    throw error;
  }
}

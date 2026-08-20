import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Contract,
  CreateContractPayload,
  UpdateContractPayload,
  AgreementType,
  ContractStatus,
} from "@/types/contract";

const CONTRACTS_SHEET = "Contracts";
const CONTRACTS_RANGE = `${CONTRACTS_SHEET}!A2:H`;
// Columns: A: ContractId, B: CompanyId, C: Description, D: AgreementType, E: PONumber, F: StartDate, G: EndDate, H: Status

/**
 * GET: Fetches all contract header rows from Google Sheets.
 */
export async function getContracts(): Promise<Contract[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTRACTS_RANGE,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row, index): Contract => {
      return {
        id: row[0] || `CTR-${String(index + 1).padStart(4, "0")}`,
        companyId: row[1] || "",
        description: row[2] || undefined,
        agreementType: (row[3] as AgreementType) || "Contract",
        poNumber: row[4] || "",
        startDate: row[5] || "",
        endDate: row[6] || "",
        status: (row[7] as ContractStatus) || "Active",
      };
    });
  } catch (error) {
    console.error("Failed to fetch contracts from Google Sheets:", error);
    throw error;
  }
}

/**
 * POST: Appends a new contract header row using CompanyId.
 */
export async function addContract(
  payload: CreateContractPayload,
): Promise<Contract> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTRACTS_RANGE,
    });
    const existingRows = existingResponse.data.values || [];

    const newRowNumber = existingRows.length + 2;
    const contractId = `CTR-${String(newRowNumber - 1).padStart(4, "0")}`;

    const newRowValues = [
      contractId,
      payload.companyId || "",
      payload.description || "",
      payload.agreementType || "Contract",
      payload.poNumber || "",
      payload.startDate || "",
      payload.endDate || "",
      payload.status || "Active",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: CONTRACTS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRowValues] },
    });

    return {
      id: contractId,
      companyId: payload.companyId,
      description: payload.description,
      agreementType: payload.agreementType,
      poNumber: payload.poNumber,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status,
    };
  } catch (error) {
    console.error("Failed to create contract in Google Sheets:", error);
    throw error;
  }
}

/**
 * PUT: Updates an existing contract header row by Contract ID.
 */
export async function updateContractInSheets(
  payload: UpdateContractPayload,
): Promise<Contract> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const contracts = await getContracts();
    const rowIndex = contracts.findIndex((c) => c.id === payload.id);
    if (rowIndex === -1) {
      throw new Error(`Contract with ID ${payload.id} not found.`);
    }

    const rowNumber = rowIndex + 2; // Offset for header row
    const updateRange = `${CONTRACTS_SHEET}!A${rowNumber}:H${rowNumber}`;
    const existing = contracts[rowIndex];

    const updatedValues = [
      existing.id,
      payload.companyId !== undefined ? payload.companyId : existing.companyId,
      payload.description !== undefined ? payload.description : (existing.description || ""),
      payload.agreementType !== undefined
        ? payload.agreementType
        : existing.agreementType,
      payload.poNumber !== undefined ? payload.poNumber : (existing.poNumber || ""),
      payload.startDate !== undefined ? payload.startDate : existing.startDate,
      payload.endDate !== undefined ? payload.endDate : existing.endDate,
      payload.status !== undefined ? payload.status : existing.status,
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedValues] },
    });

    return {
      id: existing.id,
      companyId: String(updatedValues[1]),
      description: String(updatedValues[2]) || undefined,
      agreementType: updatedValues[3] as AgreementType,
      poNumber: String(updatedValues[4]) || undefined,
      startDate: String(updatedValues[5]),
      endDate: String(updatedValues[6]),
      status: updatedValues[7] as ContractStatus,
    };
  } catch (error) {
    console.error(`Failed to update contract ${payload.id}:`, error);
    throw error;
  }
}

/**
 * DELETE: Clears a contract row by Contract ID.
 */
export async function deleteContractFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const contracts = await getContracts();
    const rowIndex = contracts.findIndex((c) => c.id === id);
    if (rowIndex === -1) return;

    const rowNumber = rowIndex + 2;
    const deleteRange = `${CONTRACTS_SHEET}!A${rowNumber}:H${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(`Failed to clear contract row ${id}:`, error);
    throw error;
  }
}
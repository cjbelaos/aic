import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Contract,
  CreateContractPayload,
  UpdateContractPayload,
  AgreementType,
  ContractStatus,
} from "@/types/contract";
import { ContractConflictError, duplicateContractIds, nextContractId } from "@/lib/contractIntegrity";
import type { sheets_v4 } from "googleapis";

const CONTRACTS_SHEET = "Contracts";
const CONTRACTS_RANGE = `${CONTRACTS_SHEET}!A2:I`;
// Columns: A: ContractId, B: CompanyId, C: Description, D: AgreementType, E: PONumber, F: StartDate, G: EndDate, H: Status, I: MonthlyServiceFee

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
        monthlyServiceFee:
          row[8] !== undefined && row[8] !== ""
            ? parseFloat(String(row[8]).replace(/[₱$,]/g, "")) || undefined
            : undefined,
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

    const existingIds = existingRows.map((row) => String(row[0] ?? "").trim());
    const duplicates = duplicateContractIds(existingIds);
    if (duplicates.length) throw new ContractConflictError(`Duplicate ContractId values already exist: ${duplicates.join(", ")}. Creation was stopped.`);
    const contractId = nextContractId(existingIds);

    // Best-effort conflict check immediately before append. Google Sheets does
    // not provide a compare-and-swap transaction, so simultaneous requests can
    // still race between this read and the append.
    const latestResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CONTRACTS_SHEET}!A2:A` });
    const latestIds = (latestResponse.data.values ?? []).map((row) => String(row[0] ?? "").trim());
    if (latestIds.includes(contractId)) throw new ContractConflictError(`ContractId ${contractId} already exists. Please retry creation.`);

    const newRowValues = [
      contractId,
      payload.companyId || "",
      payload.description || "",
      payload.agreementType || "Contract",
      payload.poNumber || "",
      payload.startDate || "",
      payload.endDate || "",
      payload.status || "Active",
      payload.monthlyServiceFee ?? "",
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
      monthlyServiceFee: payload.monthlyServiceFee,
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
    const updateRange = `${CONTRACTS_SHEET}!A${rowNumber}:I${rowNumber}`;
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
      payload.monthlyServiceFee !== undefined
        ? payload.monthlyServiceFee
        : (existing.monthlyServiceFee ?? ""),
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
      monthlyServiceFee:
        updatedValues[8] !== undefined && updatedValues[8] !== ""
          ? Number(updatedValues[8]) || undefined
          : undefined,
    };
  } catch (error) {
    console.error(`Failed to update contract ${payload.id}:`, error);
    throw error;
  }
}

/**
 * DELETE: Actually deletes the contract row (shift) and cascades to child
 * rows in ContractItems and ContractReleases sheets via batchUpdate.
 */
export async function deleteContractFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Resolve sheet IDs for the three relevant tabs.
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    const resolveSheetId = (title: string): number | undefined => {
        const sid = sheetsList.find((s) => s.properties?.title === title)
          ?.properties?.sheetId;
        return sid ?? undefined;
      };

    const contractSheetId = resolveSheetId(CONTRACTS_SHEET);
    if (contractSheetId === undefined)
      throw new Error(`Sheet "${CONTRACTS_SHEET}" not found.`);

    const itemSheetId = resolveSheetId("ContractItems");
    const itemV2SheetId = resolveSheetId("ContractItemsV2");
    const releaseSheetId = resolveSheetId("ContractReleases");

    // Read all raw rows so indices map 1:1 to the sheet.
    const [contractRes, itemRes, itemV2Res, releaseRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: CONTRACTS_RANGE }),
      itemSheetId !== undefined
        ? sheets.spreadsheets.values.get({ spreadsheetId, range: "ContractItems!A2:F" })
        : Promise.resolve(null),
      itemV2SheetId !== undefined
        ? sheets.spreadsheets.values.get({ spreadsheetId, range: "ContractItemsV2!A2:G" })
        : Promise.resolve(null),
      releaseSheetId !== undefined
        ? sheets.spreadsheets.values.get({ spreadsheetId, range: "ContractReleases!A2:M" })
        : Promise.resolve(null),
    ]);

    const contractRows = contractRes.data.values || [];
    const itemRows = itemRes?.data?.values || [];
    const itemV2Rows = itemV2Res?.data?.values || [];
    const releaseRows = releaseRes?.data?.values || [];

    // Find the contract row.
    const contractMatches = contractRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => String(row[0] || "").trim() === id);
    if (contractMatches.length === 0) return;
    if (contractMatches.length > 1) {
      throw new ContractConflictError(
        `Cannot safely delete ${id}: ${contractMatches.length} parent rows share this ContractId.`,
      );
    }
    const contractIdx = contractMatches[0].index;

    const requests: sheets_v4.Schema$Request[] = [];

    // 1) Delete the contract row itself.
    requests.push({
      deleteDimension: {
        range: {
          sheetId: contractSheetId,
          dimension: "ROWS",
          startIndex: contractIdx + 1, // row 0 = header, so data row i → sheet row i+1
          endIndex: contractIdx + 2,
        },
      },
    });

    // 2) Cascade: delete all ContractItems that reference this contract.
    if (itemSheetId !== undefined) {
      itemRows
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => String(row[1] || "").trim() === id)
        .sort((a, b) => b.i - a.i) // delete bottom-up so indices stay valid
        .forEach(({ i }) => {
          requests.push({
            deleteDimension: {
              range: {
                sheetId: itemSheetId,
                dimension: "ROWS",
                startIndex: i + 1,
                endIndex: i + 2,
              },
            },
          });
        });
    }

    if (itemV2SheetId !== undefined) {
      itemV2Rows.map((row, i) => ({ row, i })).filter(({ row }) => String(row[1] || "").trim() === id).sort((a, b) => b.i - a.i).forEach(({ i }) => {
        requests.push({ deleteDimension: { range: { sheetId: itemV2SheetId, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 } } });
      });
    }

    // 3) Cascade: delete all ContractReleases that reference this contract.
    if (releaseSheetId !== undefined) {
      releaseRows
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => String(row[2] || "").trim() === id) // column C = ContractId
        .sort((a, b) => b.i - a.i)
        .forEach(({ i }) => {
          requests.push({
            deleteDimension: {
              range: {
                sheetId: releaseSheetId,
                dimension: "ROWS",
                startIndex: i + 1,
                endIndex: i + 2,
              },
            },
          });
        });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  } catch (error) {
    console.error(`Failed to delete contract row ${id}:`, error);
    throw error;
  }
}

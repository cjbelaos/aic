import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Company,
  CompanyType,
  CreateCompanyPayload,
  UpdateCompanyPayload,
} from "@/types/company";

const COMPANIES_SHEET = "Companies";
const COMPANIES_RANGE = `${COMPANIES_SHEET}!A2:H`; // A:companyId, B:companyType, C:companyName, D:tin, E:address, F:latitude, G:longitude, H:status

function getRowFromId(id: string): number {
  const rowStr = id.replace("comp_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Company ID format: ${id}`);
  }
  return rowNum;
}

function parseCompanyType(value: string | undefined): CompanyType {
  const v = (value || "").trim().toLowerCase();
  if (v === "customer") return "Customer";
  if (v === "both") return "Both";
  return "Supplier";
}

function parseStatus(value: string | undefined): "active" | "inactive" {
  if (value === undefined || value === "") return "active";
  const v = value.trim().toLowerCase();
  return v === "active" || v === "true" ? "active" : "inactive";
}

/**
 * Generates the next sequential CompanyId (COMP-<n>) based on the highest
 * existing numeric suffix. Unlike row-count-based generation, this stays
 * collision-free even when rows are deleted from the middle of the sheet.
 */
function generateCompanyId(rows: unknown[][]): string {
  let max = 0;
  rows.forEach((row) => {
    const match = /^COMP-(\d+)$/i.exec(String(row[0] || "").trim());
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  });
  return `COMP-${max + 1}`;
}

export async function getCompanies(): Promise<Company[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: COMPANIES_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return (
      rows
        .map((row, index): Company => {
          const rowNumber = index + 2; // +2 because row 1 is header, data starts at row 2
          return {
            id: `comp_${rowNumber}`,
            row: rowNumber,
            companyId: row[0] || "",
            companyType: parseCompanyType(row[1]),
            companyName: row[2] || "",
            tin: row[3] || "",
            address: row[4] || "",
            latitude: row[5] ? parseFloat(row[5]) : undefined,
            longitude: row[6] ? parseFloat(row[6]) : undefined,
            status: parseStatus(row[7]),
          };
        })
        // Hide stale/blank rows (e.g. leftover rows containing only an ID and no
        // profile data). Rows are still mapped to their physical row number above,
        // so update/delete targeting remains correct after filtering.
        .filter((c) => c.companyName.trim() !== "")
    );
  } catch (error) {
    console.error("Failed to fetch companies from Google Sheets:", error);
    throw error;
  }
}

/** Companies whose type is Supplier or Both. */
export async function getSuppliers(): Promise<Company[]> {
  const all = await getCompanies();
  return all.filter(
    (c) => c.companyType === "Supplier" || c.companyType === "Both",
  );
}

/** Companies whose type is Customer or Both. */
export async function getCustomers(): Promise<Company[]> {
  const all = await getCompanies();
  return all.filter(
    (c) => c.companyType === "Customer" || c.companyType === "Both",
  );
}

export async function addCompany(
  payload: CreateCompanyPayload,
): Promise<Company> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: COMPANIES_RANGE,
    });
    const existingRows = response.data.values || [];

    // ── Duplicate-name merge ─────────────────────────────────────────
    // If a company with the same name already exists (case-insensitive),
    // update that row in place instead of creating a second row.
    // When the types differ (Supplier vs Customer), the merged row is
    // promoted to "Both" so adding the same company from the Suppliers
    // page and then the Customers page yields a single "Both" record.
    const incomingName = (payload.companyName || "").trim().toLowerCase();
    const matchIndex = incomingName
      ? existingRows.findIndex(
          (row) =>
            String(row[2] || "")
              .trim()
              .toLowerCase() === incomingName,
        )
      : -1;

    if (matchIndex >= 0) {
      const existingRow = existingRows[matchIndex];
      const existingType = parseCompanyType(existingRow[1]);
      const mergedType: CompanyType =
        existingType === payload.companyType ? existingType : "Both";

      const rowNumber = matchIndex + 2; // +2 because row 1 is header
      const updateRange = `${COMPANIES_SHEET}!A${rowNumber}:H${rowNumber}`;
      const updatedValues = [
        existingRow[0] || "", // keep existing CompanyId
        mergedType,
        (payload.companyName || "").trim() || existingRow[2] || "",
        payload.tin !== undefined ? payload.tin : existingRow[3] || "",
        payload.address !== undefined ? payload.address : existingRow[4] || "",
        payload.latitude !== undefined && !isNaN(payload.latitude)
          ? String(payload.latitude)
          : existingRow[5] || "",
        payload.longitude !== undefined && !isNaN(payload.longitude)
          ? String(payload.longitude)
          : existingRow[6] || "",
        payload.status === "active" ? "Active" : existingRow[7] || "Active",
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
        id: `comp_${rowNumber}`,
        row: rowNumber,
        companyId: updatedValues[0],
        companyType: mergedType,
        companyName: updatedValues[2],
        tin: updatedValues[3],
        address: updatedValues[4],
        latitude: updatedValues[5] ? parseFloat(updatedValues[5]) : undefined,
        longitude: updatedValues[6]
          ? parseFloat(updatedValues[6])
          : undefined,
        status: parseStatus(updatedValues[7]),
      };
    }

    // ── Append new row ───────────────────────────────────────────────
    const rowCount = existingRows.length;
    const newRowNumber = rowCount + 2;

    const companyId =
      (payload.companyId || "").trim() || generateCompanyId(existingRows);

    const newRowValues = [
      companyId,
      payload.companyType || "Supplier",
      payload.companyName || "",
      payload.tin || "",
      payload.address || "",
      payload.latitude !== undefined && !isNaN(payload.latitude)
        ? String(payload.latitude)
        : "",
      payload.longitude !== undefined && !isNaN(payload.longitude)
        ? String(payload.longitude)
        : "",
      payload.status === "active" ? "Active" : "Inactive",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: COMPANIES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `comp_${newRowNumber}`,
      row: newRowNumber,
      companyId,
      companyType: payload.companyType || "Supplier",
      companyName: payload.companyName || "",
      tin: payload.tin || "",
      address: payload.address || "",
      latitude: payload.latitude,
      longitude: payload.longitude,
      status: payload.status,
    };
  } catch (error) {
    console.error(`Failed to create company row in Google Sheets:`, error);
    throw error;
  }
}

export async function updateCompanyInSheets(
  payload: UpdateCompanyPayload,
): Promise<Company> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${COMPANIES_SHEET}!A${rowNumber}:H${rowNumber}`;

    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    // ── Name-collision guard ─────────────────────────────────────────
    // If the edited company name already belongs to a different row, the
    // duplicate cannot be merged automatically on edit (the two rows cannot
    // be collapsed without deleting this one). Block the save with a clear
    // message so the user can instead open the master Companies page and
    // promote the existing company's type to "Both" manually.
    const incomingName = (payload.companyName ?? "").trim().toLowerCase();
    if (incomingName) {
      const allResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: COMPANIES_RANGE,
      });
      const allRows = allResponse.data.values || [];
      const existingRowName = String(existingRow[2] || "")
        .trim()
        .toLowerCase();

      if (existingRowName !== incomingName) {
        const collisionIndex = allRows.findIndex(
          (row, idx) =>
            idx + 2 !== rowNumber && // skip the row being edited
            String(row[2] || "")
              .trim()
              .toLowerCase() === incomingName,
        );
        if (collisionIndex >= 0) {
          throw new Error(
            `Company "${payload.companyName}" already exists as "${allRows[collisionIndex][1]}" (row ${collisionIndex + 2}). Rename it first or edit the existing record on the Companies page instead.`,
          );
        }
      }
    }

    const updatedValues = [
      payload.companyId !== undefined
        ? payload.companyId
        : existingRow[0] || "",
      payload.companyType !== undefined
        ? payload.companyType
        : existingRow[1] || "",
      payload.companyName !== undefined
        ? payload.companyName
        : existingRow[2] || "",
      payload.tin !== undefined ? payload.tin : existingRow[3] || "",
      payload.address !== undefined ? payload.address : existingRow[4] || "",
      payload.latitude !== undefined && !isNaN(payload.latitude)
        ? String(payload.latitude)
        : existingRow[5] || "",
      payload.longitude !== undefined && !isNaN(payload.longitude)
        ? String(payload.longitude)
        : existingRow[6] || "",
      payload.status !== undefined
        ? payload.status === "active"
          ? "Active"
          : "Inactive"
        : existingRow[7] || "Active",
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
      row: rowNumber,
      companyId: updatedValues[0],
      companyType: parseCompanyType(updatedValues[1]),
      companyName: updatedValues[2],
      tin: updatedValues[3],
      address: updatedValues[4],
      latitude: updatedValues[5] ? parseFloat(updatedValues[5]) : undefined,
      longitude: updatedValues[6]
        ? parseFloat(updatedValues[6])
        : undefined,
      status: parseStatus(updatedValues[7]),
    };
  } catch (error) {
    console.error(
      `Failed to update company row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function clearAllCompanies(): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: COMPANIES_RANGE,
    });
  } catch (error) {
    console.error("Failed to clear all companies from Google Sheets:", error);
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

export async function deleteCompanyFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const sheetId = await getSheetTabId(sheets, spreadsheetId, COMPANIES_SHEET);

    // Physically remove the row (shift subsequent rows up).
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
      `Failed to delete company row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

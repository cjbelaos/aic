import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Supplier,
  CreateSupplierPayload,
  UpdateSupplierPayload,
} from "@/types/supplier";

const SUPPLIERS_SHEET = "Suppliers";
const SUPPLIERS_RANGE = `${SUPPLIERS_SHEET}!A2:K`; // A:supplierId, B: supplierName, C: tin, D: addressLine, E: city/municipality, F: Province, G: Country, H: deliveryLeadTime, I: deliveryTerms, J: paymentTerms, K: status

function getRowFromId(id: string): number {
  const rowStr = id.replace("supp_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Supplier ID format: ${id}`);
  }
  return rowNum;
}

export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SUPPLIERS_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): Supplier => {
      return {
        id: `supp_${index + 2}`,
        supplierId: row[0] || "",
        supplierName: row[1] || "",
        tin: row[2] || "",
        addressLine: row[3] || "",
        city: row[4] || "",
        province: row[5] || "",
        country: row[6] || "",
        deliveryLeadTime: row[7] || "",
        deliveryTerms: row[8] || "",
        paymentTerms: row[9] || "",
        status:
          row[10] !== undefined
            ? row[10] === "TRUE" || row[10] === "Active"
              ? "active"
              : "inactive"
            : "active",
      };
    });
  } catch (error) {
    console.error("Failed to fetch suppliers from Google Sheets:", error);
    throw error;
  }
}

export async function addSupplier(
  payload: CreateSupplierPayload,
): Promise<Supplier> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SUPPLIERS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2;

    const newRowValues = [
      payload.supplierId || "",
      payload.supplierName || "",
      payload.tin || "",
      payload.addressLine || "",
      payload.city || "",
      payload.province || "",
      payload.country || "",
      payload.deliveryLeadTime || "",
      payload.deliveryTerms || "",
      payload.paymentTerms || "",
      payload.status === "active" ? "Active" : "Inactive",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SUPPLIERS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `supp_${newRowNumber}`,
      supplierId: payload.supplierId || "",
      supplierName: payload.supplierName,
      tin: payload.tin || "",
      addressLine: payload.addressLine || "",
      city: payload.city || "",
      province: payload.province || "",
      country: payload.country || "",
      deliveryLeadTime: payload.deliveryLeadTime || "",
      deliveryTerms: payload.deliveryTerms || "",
      paymentTerms: payload.paymentTerms || "",
      status: payload.status,
    };
  } catch (error) {
    console.error(`Failed to create supplier row in Google Sheets:`, error);
    throw error;
  }
}

export async function updateSupplierInSheets(
  payload: UpdateSupplierPayload,
): Promise<Supplier> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${SUPPLIERS_SHEET}!A${rowNumber}:K${rowNumber}`;

    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    const updatedValues = [
      payload.supplierId !== undefined
        ? payload.supplierId
        : existingRow[0] || "",
      payload.supplierName !== undefined
        ? payload.supplierName
        : existingRow[1] || "",
      payload.tin !== undefined ? payload.tin : existingRow[2] || "",
      payload.addressLine !== undefined
        ? payload.addressLine
        : existingRow[3] || "",
      payload.city !== undefined ? payload.city : existingRow[4] || "",
      payload.province !== undefined ? payload.province : existingRow[5] || "",
      payload.country !== undefined ? payload.country : existingRow[6] || "",
      payload.deliveryLeadTime !== undefined
        ? payload.deliveryLeadTime
        : existingRow[7] || "",
      payload.deliveryTerms !== undefined
        ? payload.deliveryTerms
        : existingRow[8] || "",
      payload.paymentTerms !== undefined
        ? payload.paymentTerms
        : existingRow[9] || "",
      payload.status !== undefined
        ? payload.status === "active"
          ? "Active"
          : "Inactive"
        : existingRow[10] || "Active",
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
      supplierId: updatedValues[0],
      supplierName: updatedValues[1],
      tin: updatedValues[2],
      addressLine: updatedValues[3],
      city: updatedValues[4],
      province: updatedValues[5],
      country: updatedValues[6],
      deliveryLeadTime: updatedValues[7],
      deliveryTerms: updatedValues[8],
      paymentTerms: updatedValues[9],
      status: updatedValues[10] === "Active" ? "active" : "inactive",
    };
  } catch (error) {
    console.error(
      `Failed to update supplier row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function deleteSupplierFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const deleteRange = `${SUPPLIERS_SHEET}!A${rowNumber}:K${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear supplier row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

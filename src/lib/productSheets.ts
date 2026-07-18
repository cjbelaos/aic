import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { Product, ProductStatus, CreateProductPayload } from "@/types/product";
import { generateProductCode } from "@/lib/productCodeGenerator";

const PRODUCTS_SHEET = "Products";
const PRODUCTS_RANGE = `${PRODUCTS_SHEET}!A2:Z`;

/**
 * Safely parses Google Sheets cell values into clean numbers.
 * Removes currency markers (₱, $) and thousands-separator commas (e.g., "2,500.00" -> 2500)
 */
function parseGoogleSheetNumber(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;

  const cleanString = String(value)
    .replace(/[₱$]/g, "") // Clear any currency symbols
    .replace(/,/g, "") // Strip thousand-separator commas
    .trim();

  const parsed = parseFloat(cleanString);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Serialises a CreateProductPayload into the flat column array used by the sheet.
 */
function payloadToRow(payload: CreateProductPayload): (string | number)[] {
  return [
    payload.code || "",
    payload.name || "",
    payload.category?.name || "",
    payload.description || "",
    payload.unit?.name || "",
    payload.costPerUnit || 0,
    payload.pricePerUnit ?? "",
    payload.supplier?.supplierName || "",
    payload.minStock ?? 0,
    payload.begStock ?? 0,
    payload.qtyIn ?? 0,
    payload.actualStock ?? 0,
    payload.reservedUnits ?? 0,
    payload.qtyOut ?? 0,
    payload.status || "In Stock",
  ];
}

/**
 * POST: Appends a new product row to the bottom of the Products sheet.
 */
export async function addProduct(
  payload: CreateProductPayload,
): Promise<Product> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // First, get current row count to derive the new row's ID and sequence number
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCTS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    // Auto-generate product code if none was provided
    const categoryCode = payload.category?.code || payload.category?.name || "";
    const description = payload.description || payload.name || "";
    const sequence = rowCount + 1; // 1-based sequence
    const finalCode = payload.code?.trim()
      ? payload.code
      : generateProductCode(categoryCode, description, sequence);

    // Override the payload code with the generated one for the sheet row
    const row = payloadToRow({ ...payload, code: finalCode });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: PRODUCTS_SHEET,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    // Build and return the created product with its new ID
    const categoryStr = payload.category?.name || "";
    const unitStr = payload.unit?.name || "";
    const codeStr = payload.unit.code || "";
    const supplierStr = payload.supplier?.supplierName || "";

    return {
      id: `prod_${newRowNumber}`,
      code: finalCode,
      name: payload.name || "",
      category: { id: categoryStr, code: categoryCode, name: categoryStr },
      description: payload.description || "",
      unit: { id: unitStr, code: codeStr, name: unitStr },
      costPerUnit: payload.costPerUnit,
      pricePerUnit: payload.pricePerUnit,
      supplier: {
        id: supplierStr,
        supplierName: supplierStr,
        tin: "",
        address: "",
        status: "active",
      },
      minStock: payload.minStock ?? 0,
      begStock: payload.begStock ?? 0,
      qtyIn: payload.qtyIn ?? 0,
      actualStock: payload.actualStock ?? 0,
      reservedUnits: payload.reservedUnits ?? 0,
      qtyOut: payload.qtyOut ?? 0,
      status: payload.status || "In Stock",
    };
  } catch (error) {
    console.error("Failed to add product to Google Sheets:", error);
    throw error;
  }
}

export async function getProducts(): Promise<Product[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Fetch the data from the specified range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCTS_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return [];
    }

    // Map rows arrays back into structured Product objects
    return rows.map((row, index): Product => {
      const categoryStr = row[2] || "";
      const unitStr = row[4] || "";
      const supplierStr = row[7] || "";

      return {
        // Generates a unique string ID based on the sheet row position
        id: `prod_${index + 2}`,
        code: row[0] || "",
        name: row[1] || "",
        category: {
          id: categoryStr,
          code: categoryStr,
          name: categoryStr,
        },
        description: row[3] || "",
        unit: {
          id: unitStr,
          code: "",
          name: unitStr,
        },

        // 🔥 Clean numeric parsing to handle commas like 2,500.00 properly
        costPerUnit: parseGoogleSheetNumber(row[5]),
        pricePerUnit: parseGoogleSheetNumber(row[6]),

        supplier: {
          id: supplierStr,
          supplierName: supplierStr,
          tin: "",
          address: "",
          status: "active",
        },
        // Clean stock metrics
        minStock: parseGoogleSheetNumber(row[8]),
        begStock: parseGoogleSheetNumber(row[9]),
        qtyIn: parseGoogleSheetNumber(row[10]),
        actualStock: parseGoogleSheetNumber(row[11]),
        reservedUnits: parseGoogleSheetNumber(row[12]),
        qtyOut: parseGoogleSheetNumber(row[13]),

        status: (row[14] || "In Stock") as ProductStatus,
      };
    });
  } catch (error) {
    console.error("Failed to fetch products from Google Sheets:", error);
    throw error;
  }
}

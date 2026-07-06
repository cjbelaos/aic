import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { Product, ProductStatus, CreateProductPayload } from "@/types/product";

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
    payload.clientCode || "",
    payload.productCode || "",
    payload.category?.name || "",
    payload.customer?.customerName || payload.customer?.companyName || "",
    payload.productName || "",
    payload.description || "",
    payload.unit?.name || "",
    payload.costPerUnit || 0,
    payload.pricePerUnit ?? "",
    payload.supplier?.supplierName || "",
    payload.status || "In Stock",
    payload.minStock ?? 0,
    payload.begStock ?? 0,
    payload.qtyIn ?? 0,
    payload.actualStock ?? 0,
    payload.reservedUnits ?? 0,
    payload.qtyOut ?? 0,
    payload.inventoryFlag || "",
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

    // First, get current row count to derive the new row's ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCTS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    const row = payloadToRow(payload);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: PRODUCTS_SHEET,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    // Build and return the created product with its new ID
    const categoryStr = payload.category?.name || "";
    const customerStr =
      payload.customer?.customerName || payload.customer?.companyName || "";
    const unitStr = payload.unit?.name || "";
    const supplierStr = payload.supplier?.supplierName || "";

    return {
      id: `prod_${newRowNumber}`,
      clientCode: payload.clientCode || "",
      productCode: payload.productCode || "",
      category: { id: categoryStr, name: categoryStr },
      customer: {
        id: customerStr,
        customerName: customerStr,
        companyName: customerStr,
        contactPerson: "",
        contactNumber: "",
        email: "",
        tin: "",
        address: "",
      },
      productName: payload.productName,
      description: payload.description || "",
      unit: { id: unitStr, name: unitStr },
      costPerUnit: payload.costPerUnit,
      pricePerUnit: payload.pricePerUnit,
      supplier: {
        id: supplierStr,
        supplierName: supplierStr,
        tin: "",
        address: "",
        status: "",
      },
      status: payload.status || "In Stock",
      minStock: payload.minStock ?? 0,
      begStock: payload.begStock ?? 0,
      qtyIn: payload.qtyIn ?? 0,
      actualStock: payload.actualStock ?? 0,
      reservedUnits: payload.reservedUnits ?? 0,
      qtyOut: payload.qtyOut ?? 0,
      inventoryFlag: payload.inventoryFlag || "",
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
      const customerStr = row[3] || "";
      const unitStr = row[6] || "";
      const supplierStr = row[9] || "";

      return {
        // Generates a unique string ID based on the sheet row position
        id: `prod_${index + 2}`,
        clientCode: row[0] || "",
        productCode: row[1] || "",
        category: {
          id: categoryStr,
          name: categoryStr,
        },
        customer: {
          id: customerStr,
          customerName: customerStr,
          companyName: customerStr,
          contactPerson: "",
          contactNumber: "",
          email: "",
          tin: "",
          address: "",
        },
        productName: row[4] || "",
        description: row[5] || "",
        unit: {
          id: unitStr,
          name: unitStr,
        },

        // 🔥 Clean numeric parsing to handle commas like 2,500.00 properly
        costPerUnit: parseGoogleSheetNumber(row[7]),
        pricePerUnit: parseGoogleSheetNumber(row[8]),

        supplier: {
          id: supplierStr,
          supplierName: supplierStr,
          tin: "",
          address: "",
          status: "",
        },
        status: (row[10] || "In Stock") as ProductStatus,

        // Clean stock metrics
        minStock: parseGoogleSheetNumber(row[11]),
        begStock: parseGoogleSheetNumber(row[12]),
        qtyIn: parseGoogleSheetNumber(row[13]),
        actualStock: parseGoogleSheetNumber(row[14]),
        reservedUnits: parseGoogleSheetNumber(row[15]),
        qtyOut: parseGoogleSheetNumber(row[16]),
        inventoryFlag: row[17] || "",
      };
    });
  } catch (error) {
    console.error("Failed to fetch products from Google Sheets:", error);
    throw error;
  }
}

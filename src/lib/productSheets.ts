import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { Product, CreateProductPayload } from "@/types/product";
import { generateProductCode } from "@/lib/productCodeGenerator";
import { getProductCategories } from "@/lib/productCategorySheets";
import { getProductUnits } from "@/lib/productUnitSheets";
import { getCompanies } from "@/lib/companySheets"; // Assuming suppliers are now represented by the Company type

const PRODUCTS_SHEET = "Products";
// A=ProductCode, B=ProductName, C=ProductCategoryCode,
// D=ProductDescription, E=UnitCode, F=Cost/Unit, G=Price/Unit, H=SupplierId
const PRODUCTS_RANGE = `${PRODUCTS_SHEET}!A2:H`;

function parseGoogleSheetNumber(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  const cleanString = String(value)
    .replace(/[₱$]/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = parseFloat(cleanString);
  return isNaN(parsed) ? 0 : parsed;
}

/** Serialises a CreateProductPayload into the 8-column sheet row (A=ProductCode … H=SupplierId). */
function payloadToRow(payload: CreateProductPayload): (string | number)[] {
  return [
    payload.code || "",
    payload.name || "",
    payload.category?.code || payload.category?.name || "",
    payload.description || "",
    payload.unit?.code || payload.unit?.name || "",
    payload.costPerUnit || 0,
    payload.pricePerUnit ?? "",
    payload.supplier?.companyId || payload.supplier?.id || "",
  ];
}

/** DELETE: Clears all product rows from the Products sheet. */
export async function clearAllProducts(): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: PRODUCTS_RANGE,
    });
  } catch (error) {
    console.error("Failed to clear all products from Google Sheets:", error);
    throw error;
  }
}

/** POST: Appends a new product row to the bottom of the Products sheet. */
export async function addProduct(
  payload: CreateProductPayload,
): Promise<Product> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCTS_RANGE,
    });
    const rowCount = (response.data.values || []).length;
    const newRowNumber = rowCount + 2; // +2 because row 1 is header, data starts at row 2

    const categoryCode = payload.category?.code || payload.category?.name || "";
    const description = payload.description || payload.name || "";
    const sequence = rowCount + 1;
    const finalCode = payload.code?.trim()
      ? payload.code
      : generateProductCode(categoryCode, description, sequence);

    const row = payloadToRow({ ...payload, code: finalCode });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: PRODUCTS_SHEET,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return {
      id: `prod_${newRowNumber}`,
      code: finalCode,
      name: payload.name || "",
      category: {
        id: categoryCode,
        code: categoryCode,
        name: payload.category?.name || categoryCode,
      },
      description: payload.description || "",
      unit: {
        id: payload.unit?.code || "",
        code: payload.unit?.code || "",
        name: payload.unit?.name || "",
      },
      costPerUnit: payload.costPerUnit,
      pricePerUnit: payload.pricePerUnit,
      supplier: payload.supplier || {
        id: "",
        companyId: "",
        companyName: "",
        companyType: "Supplier",
        row: 0,
        tin: "",
        address: "",
        latitude: undefined,
        longitude: undefined,
        status: "active",
      },
    };
  } catch (error) {
    console.error("Failed to add product to Google Sheets:", error);
    throw error;
  }
}

/** GET: Reads all product rows, resolving codes/supplier IDs via their sheets. */
export async function getProducts(): Promise<Product[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PRODUCTS_RANGE,
    });
    const rows = response.data.values;

    if (!rows || rows.length === 0) return [];

    // Resolve reference data once so column C/F/H codes map to names/objects.
    const [categories, units, suppliers] = await Promise.all([
      getProductCategories().catch(() => []),
      getProductUnits().catch(() => []),
      getCompanies().catch(() => []),
    ]);

    return rows.map((row, index): Product => {
      const categoryCode = String(row[2] || "").trim();
      const unitCode = String(row[4] || "").trim();
      const supplierId = String(row[7] || "").trim();

      const category = categories.find(
        (c) => c.code === categoryCode || c.name === categoryCode,
      );
      const unit = units.find(
        (u) => u.code === unitCode || u.name === unitCode,
      );
      const supplier = suppliers.find(
        (s) => s.companyId === supplierId || s.id === supplierId,
      );

      return {
        id: `prod_${index + 2}`,
        code: String(row[0] || "").trim(),
        name: String(row[1] || "").trim(),
        category: category || {
          id: categoryCode,
          code: categoryCode,
          name: categoryCode,
        },
        description: String(row[3] || "").trim(),
        unit: unit || { id: unitCode, code: unitCode, name: unitCode },
        costPerUnit: parseGoogleSheetNumber(row[5]),
        pricePerUnit: parseGoogleSheetNumber(row[6]),
        supplier: supplier || {
          id: supplierId,
          row: 0,
          companyId: supplierId,
          companyType: "Supplier",
          companyName: supplierId,
          tin: "",
          address: "",
          latitude: undefined,
          longitude: undefined,
          status: "active",
        },
      };
    });
  } catch (error) {
    console.error("Failed to fetch products from Google Sheets:", error);
    throw error;
  }
}

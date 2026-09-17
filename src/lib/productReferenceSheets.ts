import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isMissingSheetError } from "@/lib/v2Sheets.utils";
import { nextStableId, rowNumberFromStableId } from "@/lib/v2Sheets.utils";
import type { ProductCategoryV2, ProductUnitV2 } from "@/types/product-reference-v2";

export const PRODUCT_CATEGORIES_V2_SHEET = "ProductCategoriesV2";
export const PRODUCT_UNITS_V2_SHEET = "ProductUnitsV2";

export async function getProductCategoriesV2(): Promise<ProductCategoryV2[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PRODUCT_CATEGORIES_V2_SHEET}!A2:D` });
    return (response.data.values ?? []).flatMap((row): ProductCategoryV2[] => {
      const productCategoryId = String(row[0] ?? "").trim();
      if (!productCategoryId) return [];
      return [{ productCategoryId, categoryCode: String(row[1] ?? "").trim(), categoryName: String(row[2] ?? "").trim(), status: String(row[3] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active" }];
    });
  } catch (error) { if (isMissingSheetError(error)) return []; throw error; }
}

export async function getProductUnitsV2(): Promise<ProductUnitV2[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PRODUCT_UNITS_V2_SHEET}!A2:D` });
    return (response.data.values ?? []).flatMap((row): ProductUnitV2[] => {
      const unitId = String(row[0] ?? "").trim();
      if (!unitId) return [];
      return [{ unitId, unitCode: String(row[1] ?? "").trim(), unitName: String(row[2] ?? "").trim(), status: String(row[3] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active" }];
    });
  } catch (error) { if (isMissingSheetError(error)) return []; throw error; }
}

export async function addProductCategoryV2(payload: Omit<ProductCategoryV2, "productCategoryId">): Promise<ProductCategoryV2> {
  const existing = await getProductCategoriesV2();
  if (existing.some((item) => item.categoryCode.toLowerCase() === payload.categoryCode.trim().toLowerCase())) throw new Error(`Category code "${payload.categoryCode}" already exists.`);
  const record = { ...payload, categoryCode: payload.categoryCode.trim(), categoryName: payload.categoryName.trim(), productCategoryId: nextStableId("PCAT", existing.map((item) => item.productCategoryId)) };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: `${PRODUCT_CATEGORIES_V2_SHEET}!A2:D`, valueInputOption: "USER_ENTERED", requestBody: { values: [[record.productCategoryId, record.categoryCode, record.categoryName, record.status]] } });
  return record;
}

export async function updateProductCategoryV2(id: string, payload: Partial<Omit<ProductCategoryV2, "productCategoryId">>): Promise<ProductCategoryV2> {
  const existing = await getProductCategoriesV2(); const current = existing.find((item) => item.productCategoryId === id);
  if (!current) throw new Error(`Category "${id}" was not found.`);
  const updated = { ...current, ...payload, categoryCode: (payload.categoryCode ?? current.categoryCode).trim(), categoryName: (payload.categoryName ?? current.categoryName).trim() };
  const row = rowNumberFromStableId(id, existing.map((item) => item.productCategoryId)); const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${PRODUCT_CATEGORIES_V2_SHEET}!A${row}:D${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[updated.productCategoryId, updated.categoryCode, updated.categoryName, updated.status]] } });
  return updated;
}

export async function addProductUnitV2(payload: Omit<ProductUnitV2, "unitId">): Promise<ProductUnitV2> {
  const existing = await getProductUnitsV2();
  if (existing.some((item) => item.unitCode.toLowerCase() === payload.unitCode.trim().toLowerCase())) throw new Error(`Unit code "${payload.unitCode}" already exists.`);
  const record = { ...payload, unitCode: payload.unitCode.trim(), unitName: payload.unitName.trim(), unitId: nextStableId("UNIT", existing.map((item) => item.unitId)) };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: `${PRODUCT_UNITS_V2_SHEET}!A2:D`, valueInputOption: "USER_ENTERED", requestBody: { values: [[record.unitId, record.unitCode, record.unitName, record.status]] } });
  return record;
}

export async function updateProductUnitV2(id: string, payload: Partial<Omit<ProductUnitV2, "unitId">>): Promise<ProductUnitV2> {
  const existing = await getProductUnitsV2(); const current = existing.find((item) => item.unitId === id);
  if (!current) throw new Error(`Unit "${id}" was not found.`);
  const updated = { ...current, ...payload, unitCode: (payload.unitCode ?? current.unitCode).trim(), unitName: (payload.unitName ?? current.unitName).trim() };
  const row = rowNumberFromStableId(id, existing.map((item) => item.unitId)); const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${PRODUCT_UNITS_V2_SHEET}!A${row}:D${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[updated.unitId, updated.unitCode, updated.unitName, updated.status]] } });
  return updated;
}

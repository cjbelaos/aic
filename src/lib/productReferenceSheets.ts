import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isPostgresBackend } from "@/lib/db/postgres";
import { bool, col, sheetRows } from "@/lib/db/sheetRows";
import { isMissingSheetError, nextStableId, rowNumberFromStableId } from "@/lib/sheets.utils";
import type { ProductCategoryRecord, ProductUnitRecord } from "@/types/product-reference";

export const PRODUCT_CATEGORIES_SHEET = "ProductCategories";
export const PRODUCT_UNITS_SHEET = "ProductUnits";

export async function getProductCategories(): Promise<ProductCategoryRecord[]> {
  try {
    const rows = isPostgresBackend()
      ? await sheetRows("aic.product_categories", [col("product_category_id"), col("category_code"), col("category_name"), col("status"), bool("requires_serial"), bool("track_inventory")])
      : (await (await getSheetsClient()).spreadsheets.values.get({ spreadsheetId: await getDatabaseSpreadsheetId(), range: `${PRODUCT_CATEGORIES_SHEET}!A2:F` })).data.values;
    return (rows ?? []).flatMap((row): ProductCategoryRecord[] => {
      const productCategoryId = String(row[0] ?? "").trim();
      if (!productCategoryId) return [];
      return [{ productCategoryId, categoryCode: String(row[1] ?? "").trim(), categoryName: String(row[2] ?? "").trim(), status: String(row[3] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active", requiresSerial: String(row[4] ?? "").trim().toUpperCase() === "TRUE", trackInventory: String(row[5] ?? "").trim().toUpperCase() === "TRUE" }];
    });
  } catch (error) { if (isMissingSheetError(error)) return []; throw error; }
}

export async function getProductUnits(): Promise<ProductUnitRecord[]> {
  try {
    const rows = isPostgresBackend()
      ? await sheetRows("aic.product_units", [col("unit_id"), col("unit_code"), col("unit_name"), col("status")])
      : (await (await getSheetsClient()).spreadsheets.values.get({ spreadsheetId: await getDatabaseSpreadsheetId(), range: `${PRODUCT_UNITS_SHEET}!A2:D` })).data.values;
    return (rows ?? []).flatMap((row): ProductUnitRecord[] => {
      const unitId = String(row[0] ?? "").trim();
      if (!unitId) return [];
      return [{ unitId, unitCode: String(row[1] ?? "").trim(), unitName: String(row[2] ?? "").trim(), status: String(row[3] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active" }];
    });
  } catch (error) { if (isMissingSheetError(error)) return []; throw error; }
}

export async function addProductCategory(payload: Omit<ProductCategoryRecord, "productCategoryId">): Promise<ProductCategoryRecord> {
  const existing = await getProductCategories();
  if (existing.some((item) => item.categoryCode.toLowerCase() === payload.categoryCode.trim().toLowerCase())) throw new Error(`Category code "${payload.categoryCode}" already exists.`);
  const record = { ...payload, requiresSerial: payload.requiresSerial === true, trackInventory: payload.trackInventory === true, categoryCode: payload.categoryCode.trim(), categoryName: payload.categoryName.trim(), productCategoryId: nextStableId("PCAT", existing.map((item) => item.productCategoryId)) };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: `${PRODUCT_CATEGORIES_SHEET}!A2:F`, valueInputOption: "USER_ENTERED", requestBody: { values: [[record.productCategoryId, record.categoryCode, record.categoryName, record.status, record.requiresSerial ? "TRUE" : "FALSE", record.trackInventory ? "TRUE" : "FALSE"]] } });
  return record;
}

export async function updateProductCategory(id: string, payload: Partial<Omit<ProductCategoryRecord, "productCategoryId">>): Promise<ProductCategoryRecord> {
  const existing = await getProductCategories(); const current = existing.find((item) => item.productCategoryId === id);
  if (!current) throw new Error(`Category "${id}" was not found.`);
  const updated = { ...current, ...payload, categoryCode: (payload.categoryCode ?? current.categoryCode).trim(), categoryName: (payload.categoryName ?? current.categoryName).trim() };
  const row = rowNumberFromStableId(id, existing.map((item) => item.productCategoryId)); const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${PRODUCT_CATEGORIES_SHEET}!A${row}:F${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[updated.productCategoryId, updated.categoryCode, updated.categoryName, updated.status, updated.requiresSerial ? "TRUE" : "FALSE", updated.trackInventory ? "TRUE" : "FALSE"]] } });
  return updated;
}

export async function addProductUnit(payload: Omit<ProductUnitRecord, "unitId">): Promise<ProductUnitRecord> {
  const existing = await getProductUnits();
  if (existing.some((item) => item.unitCode.toLowerCase() === payload.unitCode.trim().toLowerCase())) throw new Error(`Unit code "${payload.unitCode}" already exists.`);
  const record = { ...payload, unitCode: payload.unitCode.trim(), unitName: payload.unitName.trim(), unitId: nextStableId("UNIT", existing.map((item) => item.unitId)) };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: `${PRODUCT_UNITS_SHEET}!A2:D`, valueInputOption: "USER_ENTERED", requestBody: { values: [[record.unitId, record.unitCode, record.unitName, record.status]] } });
  return record;
}

export async function updateProductUnit(id: string, payload: Partial<Omit<ProductUnitRecord, "unitId">>): Promise<ProductUnitRecord> {
  const existing = await getProductUnits(); const current = existing.find((item) => item.unitId === id);
  if (!current) throw new Error(`Unit "${id}" was not found.`);
  const updated = { ...current, ...payload, unitCode: (payload.unitCode ?? current.unitCode).trim(), unitName: (payload.unitName ?? current.unitName).trim() };
  const row = rowNumberFromStableId(id, existing.map((item) => item.unitId)); const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${PRODUCT_UNITS_SHEET}!A${row}:D${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[updated.unitId, updated.unitCode, updated.unitName, updated.status]] } });
  return updated;
}
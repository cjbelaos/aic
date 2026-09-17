import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { generateProductCode } from "@/lib/productCodeGenerator";
import { getProductCategories, getProductUnits } from "@/lib/productReferenceSheets";
import { isMissingSheetError, nextStableId, parseSheetNumber, rowNumberFromStableId } from "@/lib/sheets.utils";
import type { CreateProductRecordPayload, ProductRecord, UpdateProductRecordPayload } from "@/types/product-record";

export const PRODUCTS_SHEET = "Products";
const RANGE = `${PRODUCTS_SHEET}!A2:K`;

function rowToProduct(row: unknown[]): ProductRecord {
  return {
    productId: String(row[0] ?? "").trim(),
    productCode: String(row[1] ?? "").trim(),
    productName: String(row[2] ?? "").trim(),
    productCategoryId: String(row[3] ?? "").trim(),
    unitId: String(row[4] ?? "").trim(),
    defaultSellingPrice:
      row[5] === "" || row[5] == null ? undefined : parseSheetNumber(row[5]),
    status: String(row[6] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active",
    createdAt: String(row[7] ?? ""),
    createdBy: String(row[8] ?? ""),
    updatedAt: String(row[9] ?? "") || undefined,
    updatedBy: String(row[10] ?? "") || undefined,
  };
}

function productToRow(product: ProductRecord): Array<string | number> {
  return [
    product.productId,
    product.productCode,
    product.productName,
    product.productCategoryId,
    product.unitId,
    product.defaultSellingPrice ?? "",
    product.status,
    product.createdAt,
    product.createdBy,
    product.updatedAt ?? "",
    product.updatedBy ?? "",
  ];
}

/**
 * Canonical product read (rows in the `Products` tab).
 */
export async function getProductsOnly(): Promise<ProductRecord[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    return (response.data.values ?? [])
      .map(rowToProduct)
      .filter((product) => product.productId && product.productCode);
  } catch (error) {
    if (isMissingSheetError(error)) return [];
    throw error;
  }
}

/** Canonical product read. */
export async function getProducts(): Promise<ProductRecord[]> {
  return getProductsOnly();
}

export async function addProduct(
  payload: CreateProductRecordPayload,
  actor: string,
): Promise<ProductRecord> {
  const [existing, categories, units] = await Promise.all([getProductsOnly(), getProductCategories(), getProductUnits()]);
  if (!categories.some((category) => category.productCategoryId === payload.productCategoryId && category.status === "active")) {
    throw new Error(`Product category "${payload.productCategoryId}" was not found or is inactive.`);
  }
  if (!units.some((unit) => unit.unitId === payload.unitId && unit.status === "active")) {
    throw new Error(`Product unit "${payload.unitId}" was not found or is inactive.`);
  }
  const requestedCode = payload.productCode.trim();
  const finalCode = requestedCode || generateProductCode(payload.productCategoryId, payload.productName, existing.length + 1);
  if (existing.some((p) => p.productCode.toLowerCase() === finalCode.toLowerCase())) {
    throw new Error(`Product code "${finalCode}" already exists in Products.`);
  }
  const now = new Date().toISOString();
  const product: ProductRecord = {
    ...payload,
    productCode: finalCode,
    productName: payload.productName.trim(),
    productId: nextStableId("PROD", existing.map((p) => p.productId)),
    createdAt: now,
    createdBy: actor,
  };
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [productToRow(product)] },
  });
  return product;
}

export async function updateProduct(
  payload: UpdateProductRecordPayload,
  actor: string,
): Promise<ProductRecord> {
  const [existing, categories, units] = await Promise.all([getProductsOnly(), getProductCategories(), getProductUnits()]);
  const current = existing.find((p) => p.productId === payload.productId);
  if (!current) throw new Error(`Product "${payload.productId}" was not found in Products.`);
  const updated: ProductRecord = {
    ...current,
    ...payload,
    productCode: (payload.productCode ?? current.productCode).trim(),
    productName: (payload.productName ?? current.productName).trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  if (!categories.some((category) => category.productCategoryId === updated.productCategoryId)) {
    throw new Error(`Product category "${updated.productCategoryId}" was not found.`);
  }
  if (!units.some((unit) => unit.unitId === updated.unitId)) {
    throw new Error(`Product unit "${updated.unitId}" was not found.`);
  }
  if (existing.some((p) => p.productId !== updated.productId && p.productCode.toLowerCase() === updated.productCode.toLowerCase())) {
    throw new Error(`Product code "${updated.productCode}" already exists in Products.`);
  }
  const row = rowNumberFromStableId(payload.productId, existing.map((p) => p.productId));
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${PRODUCTS_SHEET}!A${row}:K${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [productToRow(updated)] },
  });
  return updated;
}

export async function deactivateProduct(productId: string, actor: string): Promise<ProductRecord> {
  return updateProduct({ productId, status: "inactive" }, actor);
}
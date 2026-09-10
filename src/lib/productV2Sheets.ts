import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProducts } from "@/lib/productSheets";
import { generateProductCode } from "@/lib/productCodeGenerator";
import { getProductCategoriesV2, getProductUnitsV2 } from "@/lib/productReferenceV2Sheets";
import {
  isMissingSheetError,
  nextStableId,
  parseSheetNumber,
  rowNumberFromStableId,
} from "@/lib/v2Sheets.utils";
import type {
  CreateProductV2Payload,
  ProductV2,
  UpdateProductV2Payload,
} from "@/types/product-v2";

export const PRODUCTS_V2_SHEET = "ProductsV2";
const RANGE = `${PRODUCTS_V2_SHEET}!A2:K`;

function rowToProduct(row: unknown[]): ProductV2 {
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
    sourceVersion: "v2",
  };
}

function productToRow(product: ProductV2): Array<string | number> {
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

export async function getProductsV2Only(): Promise<ProductV2[]> {
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

/** V2-first read with V1 fallback for product codes not migrated yet. */
export async function getProductsV2(): Promise<ProductV2[]> {
  const v2 = await getProductsV2Only();
  const migratedCodes = new Set(v2.map((p) => p.productCode.toLowerCase()));
  const legacy = await getProducts();
  const fallback = legacy
    .filter((p) => !migratedCodes.has(p.code.toLowerCase()))
    .map((p): ProductV2 => ({
      productId: `legacy:${p.code}`,
      productCode: p.code,
      productName: p.name,
      productCategoryId: `legacy:${p.category.code}`,
      unitId: `legacy:${p.unit.code}`,
      defaultSellingPrice: p.pricePerUnit,
      status: "active",
      createdAt: "",
      createdBy: "",
      sourceVersion: "v1",
    }));
  return [...v2, ...fallback];
}

export async function addProductV2(
  payload: CreateProductV2Payload,
  actor: string,
): Promise<ProductV2> {
  const [existing, categories, units] = await Promise.all([getProductsV2Only(), getProductCategoriesV2(), getProductUnitsV2()]);
  if (!categories.some((category) => category.productCategoryId === payload.productCategoryId && category.status === "active")) {
    throw new Error(`Product category "${payload.productCategoryId}" was not found or is inactive.`);
  }
  if (!units.some((unit) => unit.unitId === payload.unitId && unit.status === "active")) {
    throw new Error(`Product unit "${payload.unitId}" was not found or is inactive.`);
  }
  const requestedCode = payload.productCode.trim();
  const finalCode = requestedCode || generateProductCode(payload.productCategoryId, payload.productName, existing.length + 1);
  if (existing.some((p) => p.productCode.toLowerCase() === finalCode.toLowerCase())) {
    throw new Error(`Product code "${finalCode}" already exists in ProductsV2.`);
  }
  const now = new Date().toISOString();
  const product: ProductV2 = {
    ...payload,
    productCode: finalCode,
    productName: payload.productName.trim(),
    productId: nextStableId("PROD", existing.map((p) => p.productId)),
    createdAt: now,
    createdBy: actor,
    sourceVersion: "v2",
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

export async function updateProductV2(
  payload: UpdateProductV2Payload,
  actor: string,
): Promise<ProductV2> {
  const [existing, categories, units] = await Promise.all([getProductsV2Only(), getProductCategoriesV2(), getProductUnitsV2()]);
  const current = existing.find((p) => p.productId === payload.productId);
  if (!current) throw new Error(`Product "${payload.productId}" was not found in ProductsV2.`);
  const updated: ProductV2 = {
    ...current,
    ...payload,
    productCode: (payload.productCode ?? current.productCode).trim(),
    productName: (payload.productName ?? current.productName).trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    sourceVersion: "v2",
  };
  if (!categories.some((category) => category.productCategoryId === updated.productCategoryId)) {
    throw new Error(`Product category "${updated.productCategoryId}" was not found.`);
  }
  if (!units.some((unit) => unit.unitId === updated.unitId)) {
    throw new Error(`Product unit "${updated.unitId}" was not found.`);
  }
  if (existing.some((p) => p.productId !== updated.productId && p.productCode.toLowerCase() === updated.productCode.toLowerCase())) {
    throw new Error(`Product code "${updated.productCode}" already exists in ProductsV2.`);
  }
  const row = rowNumberFromStableId(payload.productId, existing.map((p) => p.productId));
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${PRODUCTS_V2_SHEET}!A${row}:K${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [productToRow(updated)] },
  });
  return updated;
}

export async function deactivateProductV2(productId: string, actor: string): Promise<ProductV2> {
  return updateProductV2({ productId, status: "inactive" }, actor);
}

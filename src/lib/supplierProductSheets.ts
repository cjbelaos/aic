import { getCompanies } from "@/lib/companySheets";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProductsV2Only } from "@/lib/productV2Sheets";
import {
  isMissingSheetError,
  nextStableId,
  parseSheetBoolean,
  parseSheetNumber,
  rowNumberFromStableId,
} from "@/lib/v2Sheets.utils";
import type {
  CreateSupplierProductV2Payload,
  SupplierProductV2,
  UpdateSupplierProductV2Payload,
} from "@/types/supplier-product";

export const SUPPLIER_PRODUCTS_V2_SHEET = "SupplierProductsV2";
const RANGE = `${SUPPLIER_PRODUCTS_V2_SHEET}!A2:M`;

function fromRow(row: unknown[]): SupplierProductV2 {
  return {
    supplierProductId: String(row[0] ?? "").trim(), productId: String(row[1] ?? "").trim(),
    supplierId: String(row[2] ?? "").trim(), supplierProductCode: String(row[3] ?? "").trim() || undefined,
    supplierProductName: String(row[4] ?? "").trim(), supplierDescription: String(row[5] ?? "").trim() || undefined,
    costPerUnit: parseSheetNumber(row[6]), isPreferredSupplier: parseSheetBoolean(row[7]),
    status: String(row[8] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active",
    createdAt: String(row[9] ?? ""), createdBy: String(row[10] ?? ""),
    updatedAt: String(row[11] ?? "") || undefined, updatedBy: String(row[12] ?? "") || undefined,
  };
}

function toRow(p: SupplierProductV2): Array<string | number | boolean> {
  return [p.supplierProductId, p.productId, p.supplierId, p.supplierProductCode ?? "", p.supplierProductName,
    p.supplierDescription ?? "", p.costPerUnit, p.isPreferredSupplier, p.status, p.createdAt, p.createdBy,
    p.updatedAt ?? "", p.updatedBy ?? ""];
}

export async function getSupplierProductsV2(filters?: { productId?: string; supplierId?: string; status?: string }): Promise<SupplierProductV2[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    return (response.data.values ?? []).map(fromRow).filter((p) => p.supplierProductId)
      .filter((p) => !filters?.productId || p.productId === filters.productId)
      .filter((p) => !filters?.supplierId || p.supplierId === filters.supplierId)
      .filter((p) => !filters?.status || p.status === filters.status);
  } catch (error) {
    if (isMissingSheetError(error)) return [];
    throw error;
  }
}

async function validateReferences(payload: CreateSupplierProductV2Payload): Promise<void> {
  const [products, companies] = await Promise.all([getProductsV2Only(), getCompanies()]);
  if (!products.some((p) => p.productId === payload.productId)) throw new Error(`Product "${payload.productId}" was not found in ProductsV2.`);
  const supplier = companies.find((c) => c.companyId === payload.supplierId);
  if (!supplier || !["Supplier", "Both"].includes(supplier.companyType)) throw new Error(`Supplier "${payload.supplierId}" was not found.`);
}

export async function addSupplierProductV2(payload: CreateSupplierProductV2Payload, actor: string): Promise<SupplierProductV2> {
  await validateReferences(payload);
  const existing = await getSupplierProductsV2();
  if (payload.isPreferredSupplier && existing.some((p) => p.productId === payload.productId && p.status === "active" && p.isPreferredSupplier)) {
    throw new Error("This product already has an active preferred supplier.");
  }
  const record: SupplierProductV2 = { ...payload, supplierProductName: payload.supplierProductName.trim(),
    supplierProductId: nextStableId("SP", existing.map((p) => p.supplierProductId)), createdAt: new Date().toISOString(), createdBy: actor };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: RANGE, valueInputOption: "USER_ENTERED", requestBody: { values: [toRow(record)] } });
  return record;
}

export async function updateSupplierProductV2(payload: UpdateSupplierProductV2Payload, actor: string): Promise<SupplierProductV2> {
  const existing = await getSupplierProductsV2();
  const current = existing.find((p) => p.supplierProductId === payload.supplierProductId);
  if (!current) throw new Error(`Supplier product "${payload.supplierProductId}" was not found.`);
  const updated: SupplierProductV2 = { ...current, ...payload, updatedAt: new Date().toISOString(), updatedBy: actor };
  await validateReferences(updated);
  if (updated.isPreferredSupplier && updated.status === "active" && existing.some((p) => p.supplierProductId !== updated.supplierProductId && p.productId === updated.productId && p.status === "active" && p.isPreferredSupplier)) {
    throw new Error("This product already has an active preferred supplier.");
  }
  const row = rowNumberFromStableId(payload.supplierProductId, existing.map((p) => p.supplierProductId));
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SUPPLIER_PRODUCTS_V2_SHEET}!A${row}:M${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [toRow(updated)] } });
  return updated;
}

export async function deactivateSupplierProductV2(id: string, actor: string): Promise<SupplierProductV2> {
  return updateSupplierProductV2({ supplierProductId: id, status: "inactive" }, actor);
}

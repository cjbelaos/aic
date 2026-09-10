import { getCompanies } from "@/lib/companySheets";
import { getCustomerPrices } from "@/lib/customerPriceSheets";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProductsV2 } from "@/lib/productV2Sheets";
import { isMissingSheetError, nextStableId, parseSheetNumber, rowNumberFromStableId } from "@/lib/v2Sheets.utils";
import type { CreateCustomerPriceV2Payload, CustomerPriceV2, UpdateCustomerPriceV2Payload } from "@/types/customer-price-v2";

export const CUSTOMER_PRICES_V2_SHEET = "CustomerPricesV2";
const RANGE = `${CUSTOMER_PRICES_V2_SHEET}!A2:L`;

function fromRow(row: unknown[]): CustomerPriceV2 {
  return {
    customerProductPriceId: String(row[0] ?? "").trim(), customerId: String(row[1] ?? "").trim(),
    productId: String(row[2] ?? "").trim(), customerProductName: String(row[3] ?? "").trim() || undefined,
    pricePerUnit: parseSheetNumber(row[4]), effectiveFrom: String(row[5] ?? "").trim() || undefined,
    effectiveTo: String(row[6] ?? "").trim() || undefined,
    status: String(row[7] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active",
    createdAt: String(row[8] ?? ""), createdBy: String(row[9] ?? ""), updatedAt: String(row[10] ?? "") || undefined,
    updatedBy: String(row[11] ?? "") || undefined, sourceVersion: "v2",
  };
}

function toRow(p: CustomerPriceV2): Array<string | number> {
  return [p.customerProductPriceId, p.customerId, p.productId, p.customerProductName ?? "", p.pricePerUnit,
    p.effectiveFrom ?? "", p.effectiveTo ?? "", p.status, p.createdAt, p.createdBy, p.updatedAt ?? "", p.updatedBy ?? ""];
}

export async function getCustomerPricesV2Only(): Promise<CustomerPriceV2[]> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    return (response.data.values ?? []).map(fromRow).filter((p) => p.customerProductPriceId);
  } catch (error) {
    if (isMissingSheetError(error)) return [];
    throw error;
  }
}

/** V2-first read; resolvable V1 pairs not present in V2 are returned as legacy records. */
export async function getCustomerPricesV2(): Promise<CustomerPriceV2[]> {
  const [v2, legacy, products, companies] = await Promise.all([getCustomerPricesV2Only(), getCustomerPrices(), getProductsV2(), getCompanies()]);
  const keys = new Set(v2.map((p) => `${p.customerId.toLowerCase()}|${p.productId.toLowerCase()}`));
  const fallback = legacy.flatMap((price): CustomerPriceV2[] => {
    const company = companies.find((c) => c.companyName.trim().toLowerCase() === price.companyName.trim().toLowerCase());
    const product = products.find((p) => p.productCode.trim().toLowerCase() === price.productCode.trim().toLowerCase());
    if (!company || !product) return [];
    const key = `${company.companyId.toLowerCase()}|${product.productId.toLowerCase()}`;
    if (keys.has(key)) return [];
    return [{ customerProductPriceId: `legacy:${price.id}`, customerId: company.companyId, productId: product.productId,
      pricePerUnit: price.pricePerUnit, status: "active", createdAt: "", createdBy: "", sourceVersion: "v1" }];
  });
  return [...v2, ...fallback];
}

function overlaps(aFrom?: string, aTo?: string, bFrom?: string, bTo?: string): boolean {
  const startA = aFrom || "0000-01-01", endA = aTo || "9999-12-31";
  const startB = bFrom || "0000-01-01", endB = bTo || "9999-12-31";
  return startA <= endB && startB <= endA;
}

async function validate(payload: CreateCustomerPriceV2Payload, excludeId?: string): Promise<void> {
  if (!(payload.pricePerUnit > 0)) throw new Error("Price per unit must be greater than zero.");
  if (payload.effectiveFrom && payload.effectiveTo && payload.effectiveFrom > payload.effectiveTo) throw new Error("EffectiveFrom cannot be after EffectiveTo.");
  const [companies, products, existing] = await Promise.all([getCompanies(), getProductsV2(), getCustomerPricesV2Only()]);
  const customer = companies.find((c) => c.companyId === payload.customerId);
  if (!customer || !["Customer", "Both"].includes(customer.companyType)) throw new Error(`Customer "${payload.customerId}" was not found.`);
  if (!products.some((p) => p.productId === payload.productId)) throw new Error(`Product "${payload.productId}" was not found.`);
  if (payload.status === "active" && existing.some((p) => p.customerProductPriceId !== excludeId && p.customerId === payload.customerId && p.productId === payload.productId && p.status === "active" && overlaps(p.effectiveFrom, p.effectiveTo, payload.effectiveFrom, payload.effectiveTo))) {
    throw new Error("An active customer price already overlaps this effective period.");
  }
}

export async function addCustomerPriceV2(payload: CreateCustomerPriceV2Payload, actor: string): Promise<CustomerPriceV2> {
  await validate(payload); const existing = await getCustomerPricesV2Only();
  const record: CustomerPriceV2 = { ...payload, customerProductPriceId: nextStableId("CPP", existing.map((p) => p.customerProductPriceId)), createdAt: new Date().toISOString(), createdBy: actor, sourceVersion: "v2" };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: RANGE, valueInputOption: "USER_ENTERED", requestBody: { values: [toRow(record)] } });
  return record;
}

export async function updateCustomerPriceV2(payload: UpdateCustomerPriceV2Payload, actor: string): Promise<CustomerPriceV2> {
  const existing = await getCustomerPricesV2Only(); const current = existing.find((p) => p.customerProductPriceId === payload.customerProductPriceId);
  if (!current) throw new Error(`Customer price "${payload.customerProductPriceId}" was not found.`);
  const updated: CustomerPriceV2 = { ...current, ...payload, updatedAt: new Date().toISOString(), updatedBy: actor, sourceVersion: "v2" };
  await validate(updated, updated.customerProductPriceId);
  const row = rowNumberFromStableId(payload.customerProductPriceId, existing.map((p) => p.customerProductPriceId));
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${CUSTOMER_PRICES_V2_SHEET}!A${row}:L${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [toRow(updated)] } });
  return updated;
}

export async function deactivateCustomerPriceV2(id: string, actor: string): Promise<CustomerPriceV2> {
  return updateCustomerPriceV2({ customerProductPriceId: id, status: "inactive" }, actor);
}

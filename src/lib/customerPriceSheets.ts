import { getCompanies } from "@/lib/companySheets";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProducts } from "@/lib/productSheets";
import { isMissingSheetError, nextStableId, parseSheetNumber, rowNumberFromStableId } from "@/lib/sheets.utils";
import type { CreateCustomerPricePayload, CustomerPrice, UpdateCustomerPricePayload } from "@/types/customer-price";

export const CUSTOMER_PRICES_SHEET = "CustomerPrices";
const RANGE = `${CUSTOMER_PRICES_SHEET}!A2:L`;

function fromRow(row: unknown[]): CustomerPrice {
  return {
    customerProductPriceId: String(row[0] ?? "").trim(), customerId: String(row[1] ?? "").trim(),
    productId: String(row[2] ?? "").trim(), customerProductName: String(row[3] ?? "").trim() || undefined,
    pricePerUnit: parseSheetNumber(row[4]), effectiveFrom: String(row[5] ?? "").trim() || undefined,
    effectiveTo: String(row[6] ?? "").trim() || undefined,
    status: String(row[7] ?? "active").toLowerCase() === "inactive" ? "inactive" : "active",
    createdAt: String(row[8] ?? ""), createdBy: String(row[9] ?? ""), updatedAt: String(row[10] ?? "") || undefined,
    updatedBy: String(row[11] ?? "") || undefined,
  };
}

function toRow(p: CustomerPrice): Array<string | number> {
  return [p.customerProductPriceId, p.customerId, p.productId, p.customerProductName ?? "", p.pricePerUnit,
    p.effectiveFrom ?? "", p.effectiveTo ?? "", p.status, p.createdAt, p.createdBy, p.updatedAt ?? "", p.updatedBy ?? ""];
}

/** Canonical customer-price read. */
export async function getCustomerPricesOnly(): Promise<CustomerPrice[]> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    return (response.data.values ?? []).map(fromRow).filter((p) => p.customerProductPriceId);
  } catch (error) {
    if (isMissingSheetError(error)) return [];
    throw error;
  }
}

/** Canonical customer-price read. */
export async function getCustomerPrices(): Promise<CustomerPrice[]> {
  return getCustomerPricesOnly();
}

function overlaps(aFrom?: string, aTo?: string, bFrom?: string, bTo?: string): boolean {
  const startA = aFrom || "0000-01-01", endA = aTo || "9999-12-31";
  const startB = bFrom || "0000-01-01", endB = bTo || "9999-12-31";
  return startA <= endB && startB <= endA;
}

async function validate(payload: CreateCustomerPricePayload, excludeId?: string): Promise<void> {
  if (!(payload.pricePerUnit > 0)) throw new Error("Price per unit must be greater than zero.");
  if (payload.effectiveFrom && payload.effectiveTo && payload.effectiveFrom > payload.effectiveTo) throw new Error("EffectiveFrom cannot be after EffectiveTo.");
  const [companies, products, existing] = await Promise.all([getCompanies(), getProducts(), getCustomerPricesOnly()]);
  const customer = companies.find((c) => c.companyId === payload.customerId);
  if (!customer || !["Customer", "Both"].includes(customer.companyType)) throw new Error(`Customer "${payload.customerId}" was not found.`);
  if (!products.some((p) => p.productId === payload.productId)) throw new Error(`Product "${payload.productId}" was not found.`);
  if (payload.status === "active" && existing.some((p) => p.customerProductPriceId !== excludeId && p.customerId === payload.customerId && p.productId === payload.productId && p.status === "active" && overlaps(p.effectiveFrom, p.effectiveTo, payload.effectiveFrom, payload.effectiveTo))) {
    throw new Error("An active customer price already overlaps this effective period.");
  }
}

export async function addCustomerPrice(payload: CreateCustomerPricePayload, actor: string): Promise<CustomerPrice> {
  await validate(payload);
  const customerId = payload.customerId;
  const productId = payload.productId;
  if (!customerId || !productId) throw new Error("Customer and product are required.");
  const existing = await getCustomerPricesOnly();
  const record: CustomerPrice = { ...payload, customerId, productId, customerProductPriceId: nextStableId("CPP", existing.map((p) => p.customerProductPriceId)), status: payload.status ?? "active", createdAt: new Date().toISOString(), createdBy: actor };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: RANGE, valueInputOption: "USER_ENTERED", requestBody: { values: [toRow(record)] } });
  return record;
}

export async function updateCustomerPrice(payload: UpdateCustomerPricePayload, actor: string): Promise<CustomerPrice> {
  const existing = await getCustomerPricesOnly();
  const id = "customerProductPriceId" in payload ? payload.customerProductPriceId : (payload.id ?? "");
  const current = existing.find((p) => p.customerProductPriceId === id);
  if (!current) throw new Error(`Customer price "${id}" was not found.`);
  const updated: CustomerPrice = { ...current, ...payload, updatedAt: new Date().toISOString(), updatedBy: actor };
  await validate(updated, updated.customerProductPriceId);
  const row = rowNumberFromStableId(updated.customerProductPriceId, existing.map((p) => p.customerProductPriceId));
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${CUSTOMER_PRICES_SHEET}!A${row}:L${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [toRow(updated)] } });
  return updated;
}

export async function deactivateCustomerPrice(id: string, actor: string): Promise<CustomerPrice> {
  return updateCustomerPrice({ customerProductPriceId: id, status: "inactive" }, actor);
}
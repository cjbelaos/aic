import { getProductsV2 } from "@/lib/productV2Sheets";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isMissingSheetError, nextStableId, rowNumberFromStableId } from "@/lib/v2Sheets.utils";
import type { ContractItem, CreateContractItemPayload, UpdateContractItemPayload } from "@/types/contract";

const SHEET = "ContractItemsV2";
const RANGE = `${SHEET}!A2:G`;

function fromRow(row: unknown[]): ContractItem {
  return { id: String(row[0] ?? "").trim(), contractId: String(row[1] ?? "").trim(), productId: String(row[2] ?? "").trim() || undefined, productCode: String(row[3] ?? "").trim(), entitledQty: Number(row[4]) || 0, frequency: String(row[5] ?? "Monthly"), status: String(row[6] ?? "Active") === "Inactive" ? "Inactive" : "Active", sourceVersion: "v2" };
}

async function rows(): Promise<ContractItem[]> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  try { const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE }); return (response.data.values ?? []).map(fromRow).filter((item) => item.id); }
  catch (error) { if (isMissingSheetError(error)) return []; throw error; }
}

async function ensureSheet(): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  if ((metadata.data.sheets ?? []).some((sheet) => sheet.properties?.title === SHEET)) return;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET}!A1:G1`, valueInputOption: "RAW", requestBody: { values: [["ContractItemId", "ContractId", "ProductId", "ProductCodeSnapshot", "EntitledQty", "Frequency", "Status"]] } });
}

async function resolve(payload: CreateContractItemPayload): Promise<{ productId: string; productCode: string }> {
  const products = await getProductsV2();
  const product = payload.productId ? products.find((item) => item.productId === payload.productId) : products.find((item) => item.productCode === payload.productCode);
  if (!product || product.sourceVersion === "v1") throw new Error("A migrated canonical product is required for a new contract item.");
  return { productId: product.productId, productCode: product.productCode };
}

export async function getContractItemsV2Only(): Promise<ContractItem[]> { return rows(); }

export async function addContractItemV2(payload: CreateContractItemPayload, reservedIds: string[] = []): Promise<ContractItem> {
  const existing = await rows(); const product = await resolve(payload); await ensureSheet();
  const item: ContractItem = { id: nextStableId("CTI", [...existing.map((row) => row.id), ...reservedIds], 4), contractId: payload.contractId, ...product, entitledQty: payload.entitledQty, frequency: payload.frequency, status: payload.status, sourceVersion: "v2" };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: RANGE, valueInputOption: "USER_ENTERED", requestBody: { values: [[item.id, item.contractId, item.productId, item.productCode, item.entitledQty, item.frequency, item.status]] } });
  return item;
}

export async function updateContractItemV2(payload: UpdateContractItemPayload): Promise<ContractItem> {
  const existing = await rows(); const current = existing.find((item) => item.id === payload.id); if (!current) throw new Error(`Contract item "${payload.id}" is not migrated to V2.`);
  if (payload.contractId && payload.contractId !== current.contractId) throw new Error(`Entitlement ${payload.id} belongs to contract ${current.contractId}, not ${payload.contractId}.`);
  const product = payload.productId || payload.productCode ? await resolve({ ...current, ...payload, productCode: payload.productCode ?? current.productCode, productId: payload.productId ?? current.productId }) : { productId: current.productId ?? "", productCode: current.productCode };
  const item: ContractItem = { ...current, ...payload, ...product, sourceVersion: "v2" };
  const row = rowNumberFromStableId(item.id, existing.map((entry) => entry.id)); const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET}!A${row}:G${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[item.id, item.contractId, item.productId ?? "", item.productCode, item.entitledQty, item.frequency, item.status]] } }); return item;
}

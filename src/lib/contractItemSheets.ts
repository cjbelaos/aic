import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProductsV2 } from "@/lib/productV2Sheets";
import { nextStableId, rowNumberFromStableId } from "@/lib/v2Sheets.utils";
import { getContracts } from "@/lib/contractSheets";
import type { ContractItem, CreateContractItemPayload, FrequencyType, UpdateContractItemPayload } from "@/types/contract";

const SHEET = "ContractItems";
const RANGE = `${SHEET}!A2:G`;
const HEADERS = ["ContractItemId", "ContractId", "ProductId", "ProductCodeSnapshot", "EntitledQty", "Frequency", "Status"];

function fromRow(row: unknown[]): ContractItem {
  return { id: String(row[0] ?? "").trim(), contractId: String(row[1] ?? "").trim(), productId: String(row[2] ?? "").trim() || undefined, productCode: String(row[3] ?? "").trim(), entitledQty: Number(row[4]) || 0, frequency: String(row[5] ?? "Monthly") as FrequencyType, status: String(row[6] ?? "Active") === "Inactive" ? "Inactive" : "Active", sourceVersion: "v2" };
}

async function rows(): Promise<ContractItem[]> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  return (response.data.values ?? []).map(fromRow).filter((item) => item.id);
}

async function ensureHeaders(): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET}!A1:G1`, valueInputOption: "RAW", requestBody: { values: [HEADERS] } });
}

async function resolveProduct(payload: Pick<CreateContractItemPayload, "productId" | "productCode">): Promise<{ productId: string; productCode: string }> {
  const products = await getProductsV2();
  const product = payload.productId ? products.find((item) => item.productId === payload.productId) : products.find((item) => item.productCode === payload.productCode);
  if (!product || product.sourceVersion === "v1") throw new Error("A migrated canonical product is required for a contract item.");
  return { productId: product.productId, productCode: product.productCode };
}

export async function getContractItems(contractId?: string): Promise<ContractItem[]> {
  const items = await rows(); return contractId ? items.filter((item) => item.contractId === contractId) : items;
}

export async function addContractItem(payload: CreateContractItemPayload): Promise<ContractItem> {
  if (!(await getContracts()).some((contract) => contract.id === payload.contractId)) throw new Error(`Contract ${payload.contractId} does not exist.`);
  const existing = await rows(); const product = await resolveProduct(payload);
  const item: ContractItem = { id: nextStableId("CTI", existing.map((row) => row.id), 4), contractId: payload.contractId, ...product, entitledQty: payload.entitledQty, frequency: payload.frequency, status: payload.status, sourceVersion: "v2" };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId(); await ensureHeaders();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: RANGE, valueInputOption: "USER_ENTERED", requestBody: { values: [[item.id, item.contractId, item.productId, item.productCode, item.entitledQty, item.frequency, item.status]] } });
  return item;
}

export async function updateContractItemInSheets(payload: UpdateContractItemPayload): Promise<ContractItem> {
  const existing = await rows(); const current = existing.find((item) => item.id === payload.id);
  if (!current) throw new Error(`Contract item ${payload.id} not found.`);
  if (payload.contractId && payload.contractId !== current.contractId) throw new Error(`Entitlement ${payload.id} belongs to contract ${current.contractId}, not ${payload.contractId}.`);
  const product = payload.productId || payload.productCode ? await resolveProduct({ productId: payload.productId ?? current.productId, productCode: payload.productCode ?? current.productCode }) : { productId: current.productId ?? "", productCode: current.productCode };
  const item: ContractItem = { ...current, ...payload, ...product, contractId: current.contractId, sourceVersion: "v2" };
  const row = rowNumberFromStableId(item.id, existing.map((entry) => entry.id)); const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET}!A${row}:G${row}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[item.id, item.contractId, item.productId ?? "", item.productCode, item.entitledQty, item.frequency, item.status]] } });
  return item;
}

export async function deleteContractItemFromSheets(id: string, expectedContractId?: string): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId();
  const [metadata, response] = await Promise.all([sheets.spreadsheets.get({ spreadsheetId }), sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE })]);
  const sheetId = metadata.data.sheets?.find((entry) => entry.properties?.title === SHEET)?.properties?.sheetId;
  if (sheetId == null) throw new Error(`Sheet "${SHEET}" not found.`);
  const matches = (response.data.values ?? []).map((row, index) => ({ row, index })).filter(({ row }) => String(row[0] ?? "").trim() === id).sort((a, b) => b.index - a.index);
  if (!matches.length) throw new Error(`Contract item ${id} not found.`);
  for (const { row } of matches) { const actualContractId = String(row[1] ?? "").trim(); if (expectedContractId && actualContractId !== expectedContractId) throw new Error(`Entitlement ${id} belongs to contract ${actualContractId}, not ${expectedContractId}.`); }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: matches.map(({ index }) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: index + 1, endIndex: index + 2 } } })) } });
}

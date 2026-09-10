import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProductsV2 } from "@/lib/productV2Sheets";
import { getContracts } from "@/lib/contractSheets";
import { addContractItemV2, getContractItemsV2Only, updateContractItemV2 } from "@/lib/contractItemV2Sheets";
import type { ContractItem, CreateContractItemPayload, FrequencyType, UpdateContractItemPayload } from "@/types/contract";

const LEGACY_SHEET = "ContractItems";
const LEGACY_RANGE = `${LEGACY_SHEET}!A2:F`;
const V2_SHEET = "ContractItemsV2";

async function getLegacyRows(): Promise<{ rows: unknown[][]; items: ContractItem[] }> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEGACY_RANGE });
    const rows = response.data.values ?? [];
    return {
      rows,
      items: rows.map((row): ContractItem => ({
        id: String(row[0] ?? "").trim(),
        contractId: String(row[1] ?? "").trim(),
        productCode: String(row[2] ?? "").trim(),
        entitledQty: Number(row[3]) || 0,
        frequency: String(row[4] ?? "Monthly") as FrequencyType,
        status: String(row[5] ?? "Active") === "Inactive" ? "Inactive" : "Active",
        sourceVersion: "v1" as const,
      })).filter((item) => item.id),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unable to parse range|requested entity was not found|not found/i.test(message)) return { rows: [], items: [] };
    throw error;
  }
}

export async function getContractItems(contractId?: string): Promise<ContractItem[]> {
  const [legacy, v2, products] = await Promise.all([getLegacyRows(), getContractItemsV2Only(), getProductsV2()]);
  const v2Ids = new Set(v2.map((item) => item.id));
  const fallback = legacy.items.filter((item) => !v2Ids.has(item.id)).map((item) => ({
    ...item,
    productId: products.find((product) => product.productCode === item.productCode)?.productId,
  }));
  const result = [...v2, ...fallback];
  return contractId ? result.filter((item) => item.contractId === contractId) : result;
}

export async function addContractItem(payload: CreateContractItemPayload): Promise<ContractItem> {
  if (!(await getContracts()).some((contract) => contract.id === payload.contractId)) throw new Error(`Contract ${payload.contractId} does not exist.`);
  const legacy = await getLegacyRows();
  return addContractItemV2(payload, legacy.items.map((item) => item.id));
}

export async function updateContractItemInSheets(payload: UpdateContractItemPayload): Promise<ContractItem> {
  const currentV2 = (await getContractItemsV2Only()).find((item) => item.id === payload.id);
  if (currentV2) return updateContractItemV2(payload);

  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId(); const legacy = await getLegacyRows();
  const itemIndex = legacy.items.findIndex((item) => item.id === payload.id);
  if (itemIndex < 0) throw new Error(`Contract item ${payload.id} not found.`);
  const current = legacy.items[itemIndex];
  if (payload.contractId && payload.contractId !== current.contractId) throw new Error(`Entitlement ${payload.id} belongs to contract ${current.contractId}, not ${payload.contractId}.`);
  let productCode = payload.productCode ?? current.productCode;
  if (payload.productId) {
    const product = (await getProductsV2()).find((entry) => entry.productId === payload.productId);
    if (!product) throw new Error(`Product ${payload.productId} not found.`);
    productCode = product.productCode;
  }
  const updated: ContractItem = { ...current, ...payload, productCode, contractId: current.contractId };
  const physicalIndex = legacy.rows.findIndex((row) => String(row[0] ?? "").trim() === payload.id);
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${LEGACY_SHEET}!A${physicalIndex + 2}:F${physicalIndex + 2}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[updated.id, updated.contractId, updated.productCode, updated.entitledQty, updated.frequency, updated.status]] } });
  return updated;
}

export async function deleteContractItemFromSheets(id: string, expectedContractId?: string): Promise<void> {
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId(); const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const definitions = [{ title: LEGACY_SHEET, range: LEGACY_RANGE }, { title: V2_SHEET, range: `${V2_SHEET}!A2:G` }];
  const requests: Array<{ deleteDimension: { range: { sheetId: number; dimension: "ROWS"; startIndex: number; endIndex: number } } }> = [];
  let found = false;
  for (const definition of definitions) {
    const sheetId = metadata.data.sheets?.find((sheet) => sheet.properties?.title === definition.title)?.properties?.sheetId;
    if (sheetId == null) continue;
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: definition.range });
    const matchingRows = (response.data.values ?? []).map((row, index) => ({ row, index })).filter(({ row }) => String(row[0] ?? "").trim() === id).sort((a, b) => b.index - a.index);
    matchingRows.forEach(({ row, index }) => {
      found = true;
      const actualContractId = String(row[1] ?? "").trim();
      if (expectedContractId && actualContractId !== expectedContractId) throw new Error(`Entitlement ${id} belongs to contract ${actualContractId}, not ${expectedContractId}.`);
      requests.push({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: index + 1, endIndex: index + 2 } } });
    });
  }
  if (!found) throw new Error(`Contract item ${id} not found.`);
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

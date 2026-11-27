import { lineSources } from "@/lib/deliverySources";
import { isPostgresBackend } from "@/lib/db/postgres";
import { sheetRowsForRange } from "@/lib/db/sheetRows";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isMissingSheetError, nextStableId, parseSheetNumber } from "@/lib/sheets.utils";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";
import { formatSerialCell, parseSerialCell } from "@/lib/deliverySerials";
import { getDeliveryItems } from "@/lib/transactionItemSheets";
import { getProductsOnly } from "@/lib/productSheets";
import { getProductCategories } from "@/lib/productReferenceSheets";
import type { DrStockLine, MovementType, SafetyStockRow, StockMovement } from "@/lib/inventory/domain";

// Sheets layer for the inventory tabs (database spreadsheet). Header row 1, data from row 2.
// StockMovements    A:O MovementId | Date | WarehouseId | ProductId | Qty | Type | SourceType | SourceId | ReferenceNo | Note | Status | CreatedBy | CreatedAt | UpdatedBy | UpdatedAt
// StockTransfers    A:O TransferId | TransferNo | Date | FromWarehouseId | ToWarehouseId | Status | PreparedBy | Note | ApprovedBy | ApprovedAt | ApprovalNote | CreatedBy | CreatedAt | UpdatedBy | UpdatedAt
// StockTransferItems A:D TransferId | ProductId | Qty | SerialNumbers
// SafetyStock       A:E WarehouseId | ProductId | Qty | UpdatedBy | UpdatedAt

export const MOVEMENTS_SHEET = "StockMovements";
export const TRANSFERS_SHEET = "StockTransfers";
export const TRANSFER_ITEMS_SHEET = "StockTransferItems";
export const SAFETY_SHEET = "SafetyStock";

export const INVENTORY_SHEET_HEADERS: Record<string, string[]> = {
  [MOVEMENTS_SHEET]: ["MovementId", "Date", "WarehouseId", "ProductId", "Qty", "Type", "SourceType", "SourceId", "ReferenceNo", "Note", "Status", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt"],
  [TRANSFERS_SHEET]: ["TransferId", "TransferNo", "Date", "FromWarehouseId", "ToWarehouseId", "Status", "PreparedBy", "Note", "ApprovedBy", "ApprovedAt", "ApprovalNote", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt"],
  [TRANSFER_ITEMS_SHEET]: ["TransferId", "ProductId", "Qty", "SerialNumbers"],
  [SAFETY_SHEET]: ["WarehouseId", "ProductId", "Qty", "UpdatedBy", "UpdatedAt"],
};

const NOT_SET_UP = "Inventory sheets are not set up. Run npm run setup:inventory -- --apply.";

export type TransferStatus = "pending_approval" | "created" | "rejected" | "cancelled";

export interface StockTransfer {
  transferId: string;
  transferNo: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  preparedBy: string;
  note: string;
  approvedBy: string;
  approvedAt: string;
  approvalNote: string;
  createdBy: string;
  createdAt: string;
  items: { productId: string; qty: number; serialNumbers: string[] }[];
}

const text = (value: unknown) => String(value ?? "").trim();

async function client() {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  return { sheets, spreadsheetId };
}

async function readRows(range: string): Promise<unknown[][]> {
  if (isPostgresBackend()) return sheetRowsForRange(range);
  const { sheets, spreadsheetId } = await client();
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return response.data.values ?? [];
  } catch (error) {
    if (isMissingSheetError(error)) return [];
    throw error;
  }
}

async function guardWrite<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingSheetError(error)) throw new Error(NOT_SET_UP);
    throw error;
  }
}

function rowToMovement(row: unknown[]): StockMovement {
  return {
    movementId: text(row[0]),
    date: text(row[1]),
    warehouseId: text(row[2]),
    productId: text(row[3]),
    qty: parseSheetNumber(row[4]),
    type: text(row[5]).toUpperCase() as MovementType,
    sourceType: text(row[6]).toUpperCase() === "TRANSFER" ? "TRANSFER" : "ENTRY",
    sourceId: text(row[7]),
    referenceNo: text(row[8]),
    note: text(row[9]),
    status: text(row[10]).toLowerCase() === "void" ? "void" : "active",
    createdBy: text(row[11]),
    createdAt: text(row[12]),
  };
}

export async function listMovements(): Promise<StockMovement[]> {
  return (await readRows(`${MOVEMENTS_SHEET}!A2:O`)).map(rowToMovement).filter((m) => m.movementId);
}

export async function appendMovements(rows: Omit<StockMovement, "movementId">[]): Promise<StockMovement[]> {
  if (!rows.length) return [];
  const existing = await listMovements();
  const ids = existing.map((m) => m.movementId);
  const created = rows.map((row) => {
    const movementId = nextStableId("MOV", ids);
    ids.push(movementId);
    return { ...row, movementId };
  });
  const { sheets, spreadsheetId } = await client();
  await guardWrite(() => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${MOVEMENTS_SHEET}!A:O`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: created.map((m) => [m.movementId, m.date, m.warehouseId, m.productId, m.qty, m.type, m.sourceType, m.sourceId, m.referenceNo, m.note, m.status, m.createdBy, m.createdAt, "", ""]) },
  }));
  return created;
}

export async function setMovementStatus(movementIds: string[], status: "active" | "void", actor: string): Promise<void> {
  if (!movementIds.length) return;
  const rows = await readRows(`${MOVEMENTS_SHEET}!A2:A`);
  const wanted = new Set(movementIds);
  const now = new Date().toISOString();
  const data = rows.flatMap((row, index) => (wanted.has(text(row[0]))
    ? [
        { range: `${MOVEMENTS_SHEET}!K${index + 2}`, values: [[status]] },
        { range: `${MOVEMENTS_SHEET}!N${index + 2}:O${index + 2}`, values: [[actor, now]] },
      ]
    : []));
  if (!data.length) return;
  const { sheets, spreadsheetId } = await client();
  await guardWrite(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } }));
}

export async function listSafetyStock(): Promise<SafetyStockRow[]> {
  return (await readRows(`${SAFETY_SHEET}!A2:E`))
    .map((row) => ({ warehouseId: text(row[0]), productId: text(row[1]), qty: parseSheetNumber(row[2]) }))
    .filter((row) => row.warehouseId && row.productId);
}

export async function upsertSafetyStock(row: SafetyStockRow, actor: string): Promise<void> {
  const rows = await readRows(`${SAFETY_SHEET}!A2:B`);
  const index = rows.findIndex((r) => text(r[0]) === row.warehouseId && text(r[1]) === row.productId);
  const values = [[row.warehouseId, row.productId, row.qty, actor, new Date().toISOString()]];
  const { sheets, spreadsheetId } = await client();
  await guardWrite(() => (index >= 0
    ? sheets.spreadsheets.values.update({ spreadsheetId, range: `${SAFETY_SHEET}!A${index + 2}:E${index + 2}`, valueInputOption: "RAW", requestBody: { values } })
    : sheets.spreadsheets.values.append({ spreadsheetId, range: `${SAFETY_SHEET}!A:E`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values } })));
}

function rowToTransfer(row: unknown[]): Omit<StockTransfer, "items"> {
  const status = text(row[5]).toLowerCase();
  return {
    transferId: text(row[0]),
    transferNo: text(row[1]),
    date: text(row[2]),
    fromWarehouseId: text(row[3]),
    toWarehouseId: text(row[4]),
    status: (["pending_approval", "created", "rejected", "cancelled"].includes(status) ? status : "created") as TransferStatus,
    preparedBy: text(row[6]),
    note: text(row[7]),
    approvedBy: text(row[8]),
    approvedAt: text(row[9]),
    approvalNote: text(row[10]),
    createdBy: text(row[11]),
    createdAt: text(row[12]),
  };
}

export async function listTransfers(): Promise<StockTransfer[]> {
  const [headers, items] = await Promise.all([readRows(`${TRANSFERS_SHEET}!A2:O`), readRows(`${TRANSFER_ITEMS_SHEET}!A2:D`)]);
  const byTransfer = new Map<string, StockTransfer["items"]>();
  for (const row of items) {
    const id = text(row[0]);
    if (!id) continue;
    byTransfer.set(id, [...(byTransfer.get(id) ?? []), { productId: text(row[1]), qty: parseSheetNumber(row[2]), serialNumbers: parseSerialCell(row[3]) }]);
  }
  return headers.map(rowToTransfer).filter((t) => t.transferId).map((t) => ({ ...t, items: byTransfer.get(t.transferId) ?? [] }));
}

/** `ST-{yyyy}-{0001}`, sequential per year of the transfer date. */
export function nextTransferNo(existing: string[], date: string): string {
  const year = /^\d{4}/.exec(date)?.[0] ?? String(new Date().getFullYear());
  const prefix = `ST-${year}-`;
  const max = existing.reduce((n, no) => (no.startsWith(prefix) ? Math.max(n, Number.parseInt(no.slice(prefix.length), 10) || 0) : n), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Creates (no transferId) or updates a transfer header and replaces its item rows. */
export async function saveTransfer(
  input: Omit<StockTransfer, "transferId" | "transferNo"> & { transferId?: string },
  actor: string,
): Promise<StockTransfer> {
  const { sheets, spreadsheetId } = await client();
  const headerRows = await readRows(`${TRANSFERS_SHEET}!A2:O`);
  const existing = headerRows.map(rowToTransfer);
  const now = new Date().toISOString();
  const index = input.transferId ? existing.findIndex((t) => t.transferId === input.transferId) : -1;
  if (input.transferId && index < 0) throw new Error(`Stock transfer "${input.transferId}" was not found.`);
  const transferId = input.transferId ?? nextStableId("TRF", existing.map((t) => t.transferId));
  const transferNo = index >= 0 ? existing[index].transferNo : nextTransferNo(existing.map((t) => t.transferNo), input.date);
  const createdAt = index >= 0 ? existing[index].createdAt : now;
  const createdBy = index >= 0 ? existing[index].createdBy : actor;
  const row = [transferId, transferNo, input.date, input.fromWarehouseId, input.toWarehouseId, input.status, input.preparedBy, input.note, input.approvedBy, input.approvedAt, input.approvalNote, createdBy, createdAt, actor, now];
  await guardWrite(() => (index >= 0
    ? sheets.spreadsheets.values.update({ spreadsheetId, range: `${TRANSFERS_SHEET}!A${index + 2}:O${index + 2}`, valueInputOption: "RAW", requestBody: { values: [row] } })
    : sheets.spreadsheets.values.append({ spreadsheetId, range: `${TRANSFERS_SHEET}!A:O`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [row] } })));

  const itemRows = await readRows(`${TRANSFER_ITEMS_SHEET}!A2:D`);
  const matches = itemRows.map((r, i) => ({ row: r, rowNumber: i + 2 })).filter(({ row: r }) => text(r[0]) === transferId);
  await guardWrite(() => replaceChildRowsInPlace({
    sheets,
    spreadsheetId,
    sheetName: TRANSFER_ITEMS_SHEET,
    columnCount: 4,
    existingRows: matches,
    values: input.items.map((item) => [transferId, item.productId, item.qty, formatSerialCell(item.serialNumbers)]),
  }));
  return { ...input, transferId, transferNo, createdAt, createdBy };
}

/** Product ids whose category has Track inventory switched on. */
export async function listTrackedProductIds(): Promise<Set<string>> {
  const [products, categories] = await Promise.all([getProductsOnly(), getProductCategories()]);
  const tracked = new Set(categories.filter((c) => c.trackInventory === true).map((c) => c.productCategoryId));
  return new Set(products.filter((p) => tracked.has(p.productCategoryId)).map((p) => p.productId));
}

/** Every DR line with its header's date, status and warehouse. Lines without productId resolve by product code. */
export async function listDrStockLines(): Promise<DrStockLine[]> {
  const [headers, itemsByDr, products] = await Promise.all([
    readRows("DeliveryReceipts!A2:T"),
    getDeliveryItems(),
    getProductsOnly(),
  ]);
  const idByCode = new Map(products.map((p) => [p.productCode.toLowerCase(), p.productId]));
  const lines: DrStockLine[] = [];
  for (const row of headers) {
    const drNumber = Number.parseInt(text(row[0]), 10);
    if (Number.isNaN(drNumber)) continue;
    const header = { drNumber, date: text(row[1]), status: text(row[10]) || "created", warehouseId: text(row[19]) };
    for (const item of itemsByDr.get(drNumber) ?? []) {
      const productId = text(item.productId) || idByCode.get(text(item.productCode).toLowerCase()) || "";
      // One stock line per warehouse part; old lines take it all from the header warehouse.
      for (const part of lineSources(item, header.warehouseId)) {
        lines.push({ ...header, warehouseId: part.warehouseId, productId, quantity: part.quantity });
      }
    }
  }
  return lines;
}

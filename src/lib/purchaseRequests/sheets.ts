import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isMissingSheetError, nextStableId, parseSheetNumber } from "@/lib/sheets.utils";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";
import type { PrStoredStatus, PurchaseRequest, PurchaseRequestItem, PurchaseRequestLink } from "@/types/purchaseRequest";

// Sheets layer for Purchase Requests (database spreadsheet). Header row 1, data from row 2.
// Tabs are created by `npm run setup:purchase-requests -- --apply` (keep headers identical).

export const PR_SHEET = "PurchaseRequests";
export const PR_ITEMS_SHEET = "PurchaseRequestItems";
export const PR_LINKS_SHEET = "PurchaseRequestLinks";

export const PURCHASE_REQUEST_SHEET_HEADERS: Record<string, string[]> = {
  [PR_SHEET]: ["PrId", "PrNo", "Status", "SalesOrderId", "SalesOrderNo", "CustomerName", "QuotationNo", "DeliveryAddress", "RequestedByUserId", "RequestedByName", "RequestedDate", "NeededByDate", "Purpose", "CancelReason", "Version", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  [PR_ITEMS_SHEET]: ["PrItemId", "PrId", "LineNo", "ProductId", "ProductCode", "ProductName", "UnitId", "Unit", "Quantity", "SalesOrderItemId", "Remarks", "FromStockQty", "FromStockNote", "FromStockBy", "FromStockAt", "CancelledQty", "CancelReason", "CancelledBy", "CancelledAt", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  [PR_LINKS_SHEET]: ["LinkId", "PoNumber", "PoItemNo", "PrId", "PrItemId", "Quantity", "CreatedAt", "CreatedBy"],
};

const PR_RANGE = `${PR_SHEET}!A2:S`;
const ITEMS_RANGE = `${PR_ITEMS_SHEET}!A2:W`;
const LINKS_RANGE = `${PR_LINKS_SHEET}!A2:H`;

const NOT_SET_UP = "Purchase request sheets are not set up. Run npm run setup:purchase-requests -- --apply.";
const text = (value: unknown) => String(value ?? "").trim();

async function client() {
  return { sheets: await getSheetsClient(), spreadsheetId: await getDatabaseSpreadsheetId() };
}

async function readRows(range: string): Promise<unknown[][]> {
  const { sheets, spreadsheetId } = await client();
  try {
    return (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
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

function rowToPr(row: unknown[]): PurchaseRequest {
  const status = text(row[2]).toUpperCase();
  return {
    prId: text(row[0]), prNo: text(row[1]),
    status: (["DRAFT", "SUBMITTED", "CANCELLED"].includes(status) ? status : "DRAFT") as PrStoredStatus,
    salesOrderId: text(row[3]), salesOrderNoSnapshot: text(row[4]), customerNameSnapshot: text(row[5]),
    quotationNoSnapshot: text(row[6]), deliveryAddressSnapshot: text(row[7]), requestedByUserId: text(row[8]),
    requestedByName: text(row[9]), requestedDate: text(row[10]), neededByDate: text(row[11]), purpose: text(row[12]),
    cancelReason: text(row[13]), version: parseSheetNumber(row[14]) || 1, createdAt: text(row[15]), createdBy: text(row[16]),
    updatedAt: text(row[17]), updatedBy: text(row[18]),
  };
}

function prToRow(pr: PurchaseRequest): unknown[] {
  return [pr.prId, pr.prNo, pr.status, pr.salesOrderId, pr.salesOrderNoSnapshot, pr.customerNameSnapshot, pr.quotationNoSnapshot,
    pr.deliveryAddressSnapshot, pr.requestedByUserId, pr.requestedByName, pr.requestedDate, pr.neededByDate, pr.purpose,
    pr.cancelReason, pr.version, pr.createdAt, pr.createdBy, pr.updatedAt, pr.updatedBy];
}

function rowToItem(row: unknown[]): PurchaseRequestItem {
  return {
    prItemId: text(row[0]), prId: text(row[1]), lineNo: parseSheetNumber(row[2]), productId: text(row[3]),
    productCodeSnapshot: text(row[4]), productNameSnapshot: text(row[5]), unitId: text(row[6]), unitSnapshot: text(row[7]),
    quantity: parseSheetNumber(row[8]), salesOrderItemId: text(row[9]), remarks: text(row[10]),
    fromStockQty: parseSheetNumber(row[11]), fromStockNote: text(row[12]), fromStockBy: text(row[13]), fromStockAt: text(row[14]),
    cancelledQty: parseSheetNumber(row[15]), cancelReason: text(row[16]), cancelledBy: text(row[17]), cancelledAt: text(row[18]),
    createdAt: text(row[19]), createdBy: text(row[20]), updatedAt: text(row[21]), updatedBy: text(row[22]),
  };
}

function itemToRow(i: PurchaseRequestItem): unknown[] {
  return [i.prItemId, i.prId, i.lineNo, i.productId, i.productCodeSnapshot, i.productNameSnapshot, i.unitId, i.unitSnapshot,
    i.quantity, i.salesOrderItemId, i.remarks, i.fromStockQty, i.fromStockNote, i.fromStockBy, i.fromStockAt, i.cancelledQty,
    i.cancelReason, i.cancelledBy, i.cancelledAt, i.createdAt, i.createdBy, i.updatedAt, i.updatedBy];
}

function rowToLink(row: unknown[]): PurchaseRequestLink {
  return {
    linkId: text(row[0]), poNumber: text(row[1]), poItemNo: parseSheetNumber(row[2]), prId: text(row[3]),
    prItemId: text(row[4]), quantity: parseSheetNumber(row[5]), createdAt: text(row[6]), createdBy: text(row[7]),
  };
}

export async function readPurchaseRequestSnapshot(): Promise<{ prs: PurchaseRequest[]; items: PurchaseRequestItem[]; links: PurchaseRequestLink[] }> {
  const { sheets, spreadsheetId } = await client();
  let values: unknown[][][];
  try {
    const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: [PR_RANGE, ITEMS_RANGE, LINKS_RANGE] });
    values = [0, 1, 2].map((i) => response.data.valueRanges?.[i]?.values ?? []);
  } catch (error) {
    if (!isMissingSheetError(error)) throw error;
    values = [[], [], []];
  }
  return {
    prs: values[0].map(rowToPr).filter((p) => p.prId),
    items: values[1].map(rowToItem).filter((i) => i.prItemId),
    links: values[2].map(rowToLink).filter((l) => l.linkId),
  };
}

/** PO number → status (PurchaseOrders A = PO number, L = status). Light read for status derivation. */
export async function readPoStatusMap(): Promise<Map<string, string>> {
  const rows = await readRows("PurchaseOrders!A2:L");
  const map = new Map<string, string>();
  for (const row of rows) {
    const po = text(row[0]);
    if (po) map.set(po, text(row[11]).toLowerCase() || "created");
  }
  return map;
}

/** New stable ids for PR headers and items, continuing the existing sequence. */
export function allocateIds(prefix: "PR" | "PRI" | "PRL", existing: string[], count: number): string[] {
  const ids = [...existing];
  const out: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const id = nextStableId(prefix, ids);
    ids.push(id);
    out.push(id);
  }
  return out;
}

/** Inserts or updates a PR header by PrId. */
export async function savePurchaseRequestRow(pr: PurchaseRequest): Promise<void> {
  const { sheets, spreadsheetId } = await client();
  const rows = await readRows(`${PR_SHEET}!A2:A`);
  const index = rows.findIndex((r) => text(r[0]) === pr.prId);
  await guardWrite(() => (index >= 0
    ? sheets.spreadsheets.values.update({ spreadsheetId, range: `${PR_SHEET}!A${index + 2}:S${index + 2}`, valueInputOption: "RAW", requestBody: { values: [prToRow(pr)] } })
    : sheets.spreadsheets.values.append({ spreadsheetId, range: `${PR_SHEET}!A:S`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [prToRow(pr)] } })));
}

/** Replaces all item rows of one PR. */
export async function replacePurchaseRequestItems(prId: string, items: PurchaseRequestItem[]): Promise<void> {
  const { sheets, spreadsheetId } = await client();
  const rows = await readRows(`${PR_ITEMS_SHEET}!A2:B`);
  const existingRows = rows.map((r, i) => ({ row: r, rowNumber: i + 2 })).filter(({ row }) => text(row[1]) === prId);
  await guardWrite(() => replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: PR_ITEMS_SHEET, columnCount: 23, existingRows, values: items.map(itemToRow) }));
}

/** Updates a single item row in place by PrItemId. */
export async function updatePurchaseRequestItemRow(item: PurchaseRequestItem): Promise<void> {
  const { sheets, spreadsheetId } = await client();
  const rows = await readRows(`${PR_ITEMS_SHEET}!A2:A`);
  const index = rows.findIndex((r) => text(r[0]) === item.prItemId);
  if (index < 0) throw Object.assign(new Error(`Purchase request line "${item.prItemId}" was not found.`), { status: 404 });
  await guardWrite(() => sheets.spreadsheets.values.update({ spreadsheetId, range: `${PR_ITEMS_SHEET}!A${index + 2}:W${index + 2}`, valueInputOption: "RAW", requestBody: { values: [itemToRow(item)] } }));
}

/** Replaces every link row of one PO. */
export async function replaceLinksForPurchaseOrder(poNumber: string, links: Omit<PurchaseRequestLink, "linkId">[]): Promise<void> {
  const { sheets, spreadsheetId } = await client();
  const rows = await readRows(`${PR_LINKS_SHEET}!A2:B`);
  const existingRows = rows.map((r, i) => ({ row: r, rowNumber: i + 2 })).filter(({ row }) => text(row[1]) === poNumber);
  if (!existingRows.length && !links.length) return;
  // Rows being overwritten keep their ids; only extra rows need new ones.
  const keptIds = existingRows.slice(0, links.length).map(({ row }) => text(row[0]));
  const newIds = allocateIds("PRL", rows.map((r) => text(r[0])), Math.max(0, links.length - keptIds.length));
  const ids = [...keptIds, ...newIds];
  const values = links.map((l, i) => [ids[i], l.poNumber, l.poItemNo, l.prId, l.prItemId, l.quantity, l.createdAt, l.createdBy]);
  await guardWrite(() => replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: PR_LINKS_SHEET, columnCount: 8, existingRows, values }));
}

/** Repoints a draft PO's links to its final number. */
export async function renameLinksPurchaseOrder(fromPoNumber: string, toPoNumber: string): Promise<void> {
  if (fromPoNumber === toPoNumber) return;
  const { sheets, spreadsheetId } = await client();
  const rows = await readRows(`${PR_LINKS_SHEET}!A2:B`);
  const targets = rows.map((r, i) => ({ value: text(r[1]), rowNumber: i + 2 })).filter((r) => r.value === fromPoNumber);
  if (!targets.length) return;
  await guardWrite(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: targets.map(({ rowNumber }) => ({ range: `${PR_LINKS_SHEET}!B${rowNumber}`, values: [[toPoNumber]] })) } }));
}

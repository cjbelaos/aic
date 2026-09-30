// Direct Sales Order Tracker projection. The authoritative order is written
// directly by the Next.js server; this module reconciles its Tracker rows
// through the same authenticated Sheets API client.

import { getSheetsClient } from "@/lib/googleSheets";
import type { SalesOrder, SalesOrderItem } from "@/types/salesOrder";
import { payloadHash } from "./crypto-hash.ts";

type TrackerDestination = { spreadsheetId: string; sheetId: number };
type TrackerRowValue = string | number;

const TECHNICAL_START_INDEX = 23; // X, immediately after the Tracker's W column.
const TECHNICAL_HEADERS = [
  "AppSalesOrderId", "AppSalesOrderItemId", "AppOrderVersion", "AppSyncedAt",
  "AppLineStatus", "AppOrderStatus", "AppFulfillmentStatus", "AppPayloadHash",
] as const;
const TECHNICAL_END_INDEX = TECHNICAL_START_INDEX + TECHNICAL_HEADERS.length;

function trackerDestination(): TrackerDestination {
  const spreadsheetId = process.env.SALES_ORDER_DESTINATION_SPREADSHEET_ID?.trim();
  const sheetId = Number(process.env.SALES_ORDER_DESTINATION_TRACKER_SHEET_ID);
  if (!spreadsheetId || !Number.isInteger(sheetId) || sheetId < 0) {
    throw new Error(
      "Sales Order Tracker is not configured. Set SALES_ORDER_DESTINATION_SPREADSHEET_ID and SALES_ORDER_DESTINATION_TRACKER_SHEET_ID.",
    );
  }
  return { spreadsheetId, sheetId };
}

function quoteSheetName(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function trackerNumber(order: SalesOrder): string {
  if (order.legacyTrackerNo.trim()) return order.legacyTrackerNo.trim();
  const match = /^AIC-SO-\d{4}-(\d{4,})$/i.exec(order.salesOrderNo.trim());
  return match ? match[1] : order.salesOrderNo.trim();
}

function trackerLifecycle(order: SalesOrder, item: SalesOrderItem): string {
  if (order.orderStatus === "CANCELLED") return "Cancelled";
  if (order.orderStatus === "ON_HOLD") return "On Hold";
  if (order.orderStatus === "CLOSED") return "Closed";
  if (item.quantity !== null && item.cancelledQty >= item.quantity - item.fulfilledQty && item.fulfilledQty === 0) return "Cancelled";
  return item.quantity !== null && item.quantity > 0 && item.fulfilledQty >= item.quantity && item.cancelledQty === 0
    ? "Completed"
    : "Pending";
}

export function projectTrackerLine(order: SalesOrder, item: SalesOrderItem, links: { customerPO?: string; quotation?: string } = {}): {
  aToP: TrackerRowValue[];
  uToV: [string, string];
} {
  const quantity = item.quantity ?? 0;
  const aToP: TrackerRowValue[] = [
    trackerNumber(order), order.receivedDate, item.orderCategory, order.customerPONo,
    order.customerNameSnapshot, order.remarks, item.productCodeSnapshot,
    item.productNameSnapshot || item.description, item.description, quantity === 0 ? "" : quantity,
    item.unitPrice ?? "", item.discountAmount, item.taxAmount, item.lineTotal, links.customerPO ?? "", links.quotation ?? "",
  ];
  return { aToP, uToV: [order.assignedToUserId, trackerLifecycle(order, item)] };
}

function ownedPayloadHash(
  visible: { aToP: TrackerRowValue[]; uToV: [string, string] },
  metadata: readonly TrackerRowValue[],
): string {
  return payloadHash([
    ...visible.aToP, ...visible.uToV,
    metadata[0], metadata[1], metadata[2], metadata[4], metadata[5], metadata[6],
  ].map((value) => String(value ?? "")));
}

function metadataFor(order: SalesOrder, item: SalesOrderItem, visible: ReturnType<typeof projectTrackerLine>): TrackerRowValue[] {
  const metadata: TrackerRowValue[] = [
    order.salesOrderId, item.salesOrderItemId, order.version, new Date().toISOString(),
    item.lineStatus, order.orderStatus, order.fulfillmentStatus, "",
  ];
  metadata[7] = ownedPayloadHash(visible, metadata);
  return metadata;
}

function ownedCells(row: unknown[]): unknown[] {
  return row.slice(0, 16).concat(row.slice(20, 22), row.slice(TECHNICAL_START_INDEX, TECHNICAL_END_INDEX));
}

async function resolveTrackerLayout() {
  const destination = trackerDestination();
  const sheets = await getSheetsClient();
  const workbook = await sheets.spreadsheets.get({
    spreadsheetId: destination.spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))",
  });
  const sheet = workbook.data.sheets?.find((candidate) => candidate.properties?.sheetId === destination.sheetId);
  const title = sheet?.properties?.title;
  if (!title) throw new Error("Configured Sales Order Tracker sheet was not found.");
  const quotedTitle = quoteSheetName(title);
  const header = (await sheets.spreadsheets.values.get({
    spreadsheetId: destination.spreadsheetId,
    range: `${quotedTitle}!A1:${columnName(TECHNICAL_END_INDEX - 1)}1`,
    valueRenderOption: "UNFORMATTED_VALUE",
  })).data.values?.[0] ?? [];
  const existingStart = header.findIndex((value) => String(value ?? "") === TECHNICAL_HEADERS[0]);
  if (existingStart >= 0) {
    if (existingStart !== TECHNICAL_START_INDEX || TECHNICAL_HEADERS.some((name, index) => header[existingStart + index] !== name)) {
      throw new Error("Sales Order Tracker technical columns do not match the required AppSalesOrder schema.");
    }
    return { destination, sheets, sheet, quotedTitle };
  }
  if (header.slice(TECHNICAL_START_INDEX, TECHNICAL_END_INDEX).some((value) => String(value ?? "") !== "")) {
    throw new Error("Tracker columns X:AE contain existing data and cannot be reserved for Sales Order row IDs automatically.");
  }
  const columnCount = sheet.properties?.gridProperties?.columnCount ?? 0;
  const requests: object[] = [];
  if (columnCount < TECHNICAL_END_INDEX) {
    requests.push({ appendDimension: {
      sheetId: destination.sheetId, dimension: "COLUMNS", length: TECHNICAL_END_INDEX - columnCount,
    } });
  }
  requests.push({ updateDimensionProperties: {
    range: { sheetId: destination.sheetId, dimension: "COLUMNS", startIndex: TECHNICAL_START_INDEX, endIndex: TECHNICAL_END_INDEX },
    properties: { hiddenByUser: true }, fields: "hiddenByUser",
  } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: destination.spreadsheetId, requestBody: { requests } });
  await sheets.spreadsheets.values.update({
    spreadsheetId: destination.spreadsheetId,
    range: `${quotedTitle}!${columnName(TECHNICAL_START_INDEX)}1:${columnName(TECHNICAL_END_INDEX - 1)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [TECHNICAL_HEADERS as unknown as TrackerRowValue[]] },
  });
  return { destination, sheets, sheet, quotedTitle };
}

/**
 * Reconciles one Sales Order to its denormalized Tracker rows. It updates the
 * app-owned cells only (A:P, U:V and hidden X:AE), preserving user workflow
 * columns Q:T and formula column W. A removed order line is cleared from the
 * visible projection rather than deleting its whole Sheet row and risking
 * unrelated workflow data.
 */
export async function syncSalesOrderToTracker(order: SalesOrder, items: SalesOrderItem[], documentLinks: { customerPO?: string; quotation?: string } = {}): Promise<void> {
  // Historical DRAFTs were never Tracker records. New orders are confirmed on creation.
  if (!order.salesOrderNo || order.orderStatus === "DRAFT") return;
  const { destination, sheets, sheet, quotedTitle } = await resolveTrackerLayout();
  const values = (await sheets.spreadsheets.values.get({
    spreadsheetId: destination.spreadsheetId,
    range: `${quotedTitle}!A1:${columnName(TECHNICAL_END_INDEX - 1)}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  })).data.values ?? [];
  const existingByItemId = new Map<string, number>();
  const existingForOrder: Array<{ rowNumber: number; itemId: string }> = [];
  let lastOwnedRow = 1;
  values.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (ownedCells(row).some((value) => String(value ?? "") !== "")) lastOwnedRow = rowNumber;
    const orderId = String(row[TECHNICAL_START_INDEX] ?? "");
    const itemId = String(row[TECHNICAL_START_INDEX + 1] ?? "");
    if (!itemId) return;
    if (existingByItemId.has(itemId)) throw new Error(`Sales Order Tracker has duplicate AppSalesOrderItemId ${itemId}.`);
    existingByItemId.set(itemId, rowNumber);
    if (orderId === order.salesOrderId) existingForOrder.push({ rowNumber, itemId });
  });

  // Preserve document cells on ordinary order updates. New links are passed by
  // the conversion and attachment routes and then copied to every item row.
  const previous = existingForOrder.length ? values[existingForOrder[0].rowNumber - 1] : undefined;
  const links = {
    customerPO: documentLinks.customerPO ?? String(previous?.[14] ?? ""),
    quotation: documentLinks.quotation ?? String(previous?.[15] ?? ""),
  };

  const desiredItems = [...items]
    .filter((item) => item.lineStatus !== "INACTIVE")
    .sort((left, right) => left.lineNo - right.lineNo);
  const desiredIds = new Set(desiredItems.map((item) => item.salesOrderItemId));
  const updates: Array<{ range: string; values: TrackerRowValue[][] }> = [];
  let nextRow = lastOwnedRow + 1;
  for (const item of desiredItems) {
    const rowNumber = existingByItemId.get(item.salesOrderItemId) ?? nextRow++;
    const visible = projectTrackerLine(order, item, links);
    updates.push(
      { range: `${quotedTitle}!A${rowNumber}:P${rowNumber}`, values: [visible.aToP] },
      { range: `${quotedTitle}!U${rowNumber}:V${rowNumber}`, values: [visible.uToV] },
      { range: `${quotedTitle}!${columnName(TECHNICAL_START_INDEX)}${rowNumber}:${columnName(TECHNICAL_END_INDEX - 1)}${rowNumber}`, values: [metadataFor(order, item, visible)] },
    );
  }
  for (const existing of existingForOrder) {
    if (desiredIds.has(existing.itemId)) continue;
    updates.push(
      { range: `${quotedTitle}!A${existing.rowNumber}:P${existing.rowNumber}`, values: [Array(16).fill("")] },
      { range: `${quotedTitle}!U${existing.rowNumber}:V${existing.rowNumber}`, values: [["", ""]] },
      { range: `${quotedTitle}!${columnName(TECHNICAL_START_INDEX)}${existing.rowNumber}:${columnName(TECHNICAL_END_INDEX - 1)}${existing.rowNumber}`, values: [Array(TECHNICAL_HEADERS.length).fill("")] },
    );
  }
  if (updates.length === 0) return;
  const rowCount = sheet.properties?.gridProperties?.rowCount ?? 0;
  if (nextRow - 1 > rowCount) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: destination.spreadsheetId,
      requestBody: { requests: [{ appendDimension: { sheetId: destination.sheetId, dimension: "ROWS", length: nextRow - 1 - rowCount } }] },
    });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: destination.spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: updates },
  });
}

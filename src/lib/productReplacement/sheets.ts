// Google Sheets I/O for inactive-product replacement: one snapshot read, cell
// writes, Sales Order command writes and the ProductReplacements audit trail.

import { randomUUID } from "node:crypto";
import { getCompanies } from "@/lib/companySheets";
import { getContracts } from "@/lib/contractSheets";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getProductsOnly } from "@/lib/productSheets";
import { rowToItem, rowToLink, rowToPr } from "@/lib/purchaseRequests/rows";
import { QUOTATION_ROW, quotationSheetRange } from "@/lib/quotationRow";
import { payloadHash } from "@/lib/salesOrders/crypto-hash";
import { readSalesOrderListSnapshot, writeSalesOrderCommand } from "@/lib/salesOrders/repository";
import { isMissingSheetError, parseSheetNumber } from "@/lib/sheets.utils";
import type { SalesOrder, SalesOrderHistory, SalesOrderItem } from "@/types/salesOrder";
import type { CellEdit, ReplacementSnapshot, SalesOrderEdit, SnapshotProduct } from "./types";

const text = (value: unknown) => String(value ?? "").trim();

const RAW_RANGES = {
  contractItems: "ContractItems!A2:G",
  prs: "PurchaseRequests!A2:V",
  prItems: "PurchaseRequestItems!A2:X",
  prLinks: "PurchaseRequestLinks!A2:H",
  quotations: quotationSheetRange("Quotations"),
  quotationDetails: "QuotationDetails!A2:M",
  purchaseOrders: "PurchaseOrders!A2:L",
  poItems: "PurchaseOrderItems!A2:I",
  customerPrices: "CustomerPrices!A2:L",
  supplierProducts: "SupplierProducts!A2:M",
} as const;
type RawKey = keyof typeof RAW_RANGES;

async function readRawTabs(): Promise<Record<RawKey, unknown[][]>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const keys = Object.keys(RAW_RANGES) as RawKey[];
  const result = {} as Record<RawKey, unknown[][]>;
  try {
    const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: keys.map((k) => RAW_RANGES[k]) });
    keys.forEach((key, i) => { result[key] = response.data.valueRanges?.[i]?.values ?? []; });
    return result;
  } catch (error) {
    if (!isMissingSheetError(error)) throw error;
  }
  // A tab that was never set up (e.g. Purchase Requests) fails the whole batch; read one by one instead.
  for (const key of keys) {
    try {
      result[key] = (await sheets.spreadsheets.values.get({ spreadsheetId, range: RAW_RANGES[key] })).data.values ?? [];
    } catch (error) {
      if (!isMissingSheetError(error)) throw error;
      result[key] = [];
    }
  }
  return result;
}

export interface LoadedSnapshot {
  snapshot: ReplacementSnapshot;
  salesOrders: SalesOrder[];
  salesOrderItems: SalesOrderItem[];
}

/** Reads every sheet the replacement rules need. */
export async function readReplacementSnapshot(): Promise<LoadedSnapshot> {
  const [raw, products, contracts, companies, so] = await Promise.all([
    readRawTabs(), getProductsOnly(), getContracts(), getCompanies().catch(() => []), readSalesOrderListSnapshot(),
  ]);
  const companyName = new Map(companies.map((c) => [c.companyId, c.companyName]));
  const withRow = <T>(rows: unknown[][], map: (row: unknown[], rowNumber: number) => T | null) =>
    rows.map((row, i) => map(row, i + 2)).filter((value): value is T => value !== null);

  const snapshot: ReplacementSnapshot = {
    products: products.map((p) => ({ productId: p.productId, productCode: p.productCode, productName: p.productName, status: p.status })),
    contracts: contracts.map((c) => ({ id: c.id, status: c.status, endDate: c.endDate, agreementType: c.agreementType })),
    contractItems: withRow(raw.contractItems, (row, rowNumber) => text(row[0]) ? {
      id: text(row[0]), contractId: text(row[1]), productId: text(row[2]), productCode: text(row[3]),
      status: text(row[6]) === "Inactive" ? "Inactive" : "Active", rowNumber,
    } : null),
    salesOrders: so.orders.map((o) => ({ salesOrderId: o.salesOrderId, salesOrderNo: o.salesOrderNo, orderStatus: o.orderStatus, version: o.version })),
    salesOrderItems: so.items.map((i) => ({
      salesOrderItemId: i.salesOrderItemId, salesOrderId: i.salesOrderId, lineNo: i.lineNo, productId: i.productId,
      lineStatus: i.lineStatus, quantity: i.quantity, fulfilledQty: i.fulfilledQty, cancelledQty: i.cancelledQty,
    })),
    purchaseRequests: withRow(raw.prs, (row, rowNumber) => {
      const pr = rowToPr(row);
      return pr.prId ? { prId: pr.prId, prNo: pr.prNo, status: pr.status, version: pr.version, rowNumber } : null;
    }),
    prItems: withRow(raw.prItems, (row, rowNumber) => {
      const item = rowToItem(row);
      return item.prItemId ? {
        prItemId: item.prItemId, prId: item.prId, lineNo: item.lineNo, productId: item.productId,
        productCode: item.productCodeSnapshot, productName: item.productNameSnapshot, quantity: item.quantity,
        fromStockQty: item.fromStockQty, cancelledQty: item.cancelledQty, rowNumber,
      } : null;
    }),
    prLinks: withRow(raw.prLinks, (row) => {
      const link = rowToLink(row);
      return link.linkId ? { prItemId: link.prItemId, quantity: link.quantity } : null;
    }),
    quotations: withRow(raw.quotations, (row) => text(row[QUOTATION_ROW.quotationNo])
      ? { quotationNo: text(row[QUOTATION_ROW.quotationNo]), status: (text(row[QUOTATION_ROW.status]) || "DRAFT").toUpperCase() } : null),
    quotationDetails: withRow(raw.quotationDetails, (row, rowNumber) => text(row[0])
      ? { quotationNo: text(row[0]), productId: text(row[1]), productCode: text(row[2]), rowNumber } : null),
    purchaseOrders: withRow(raw.purchaseOrders, (row) => text(row[0])
      ? { poNumber: text(row[0]), supplierId: text(row[2]), status: (text(row[11]) || "created").toLowerCase() } : null),
    poItems: withRow(raw.poItems, (row, rowNumber) => text(row[0])
      ? { poNumber: text(row[0]), itemNo: Number(row[1]) || 0, supplierProductId: text(row[2]), productId: text(row[3]), rowNumber } : null),
    customerPrices: withRow(raw.customerPrices, (row, rowNumber) => text(row[0]) ? {
      id: text(row[0]), customerId: text(row[1]), customerName: companyName.get(text(row[1])) ?? "", productId: text(row[2]),
      pricePerUnit: parseSheetNumber(row[4]), status: text(row[7]).toLowerCase() === "inactive" ? "inactive" : "active", rowNumber,
    } : null),
    supplierProducts: withRow(raw.supplierProducts, (row, rowNumber) => text(row[0]) ? {
      id: text(row[0]), productId: text(row[1]), supplierId: text(row[2]), supplierName: companyName.get(text(row[2])) ?? "",
      status: text(row[8]).toLowerCase() === "inactive" ? "inactive" : "active", rowNumber,
    } : null),
  };
  return { snapshot, salesOrders: so.orders, salesOrderItems: so.items };
}

/** Whole numbers without a leading zero go in as numbers (e.g. PR versions); everything else stays text. */
function cellValue(value: string): string | number {
  return /^[1-9]\d{0,14}$/.test(value) ? Number(value) : value;
}

export async function applyCellEdits(edits: readonly CellEdit[]): Promise<void> {
  if (!edits.length) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: edits.map((e) => ({ range: `${e.sheet}!${e.column}${e.rowNumber}`, values: [[cellValue(e.newValue)]] })),
    },
  });
}

/** Swaps the product on the listed lines of one Sales Order through its versioned command writer. */
export async function applySalesOrderEdit(
  edit: SalesOrderEdit, loaded: LoadedSnapshot, to: SnapshotProduct, actor: string, nowIso: string, replacementId: string,
): Promise<CellEdit[]> {
  const order = loaded.salesOrders.find((o) => o.salesOrderId === edit.salesOrderId);
  if (!order) throw new Error(`Sales Order ${edit.salesOrderId} was not found.`);
  const ids = new Set(edit.itemIds);
  const items = loaded.salesOrderItems.filter((i) => i.salesOrderId === order.salesOrderId && ids.has(i.salesOrderItemId));
  const updated = items.map((item) => ({
    ...item, productId: to.productId, productCodeSnapshot: to.productCode, productNameSnapshot: to.productName,
    updatedAt: nowIso, updatedBy: actor,
  }));
  const commandId = randomUUID();
  const history: SalesOrderHistory[] = items.map((item) => ({
    eventId: randomUUID(), salesOrderId: order.salesOrderId, salesOrderItemId: item.salesOrderItemId,
    eventType: "PRODUCT_REPLACED", fromStatus: order.orderStatus, toStatus: order.orderStatus,
    changedFieldsJson: JSON.stringify({ productId: { from: item.productId, to: to.productId } }),
    reason: `Duplicate product replaced (${replacementId})`, commandId, actorUserId: actor, createdAt: nowIso,
  }));
  const payload = {
    salesOrderId: order.salesOrderId, receivedDate: order.receivedDate,
    order: { ...order, updatedAt: nowIso, updatedBy: actor }, items: updated, history, hadItems: true,
  };
  await writeSalesOrderCommand({
    commandId, commandType: "so.update", salesOrderId: order.salesOrderId, expectedVersion: edit.expectedVersion,
    actorUserId: actor, requestHash: payloadHash(payload), payload,
  });
  return items.map((item) => ({ sheet: "SalesOrderItems", rowNumber: 0, column: `ProductId:${item.salesOrderItemId}`, oldValue: item.productId, newValue: to.productId }));
}

// ── Audit trail ──────────────────────────────────────────────

const AUDIT_TAB = "ProductReplacements";
const AUDIT_ROWS_TAB = "ProductReplacementRows";
const AUDIT_HEADERS = ["ReplacementId", "FromProductId", "ToProductId", "Actor", "StartedAt", "FinishedAt", "Status", "Error"];
const AUDIT_ROWS_HEADERS = ["ReplacementId", "Sheet", "RowNumber", "Column", "OldValue", "NewValue", "AppliedAt"];

export async function ensureAuditTabs(): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const titles = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const missing = [[AUDIT_TAB, AUDIT_HEADERS], [AUDIT_ROWS_TAB, AUDIT_ROWS_HEADERS]].filter(([title]) => !titles.has(title as string)) as [string, string[]][];
  if (!missing.length) return;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missing.map(([title]) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) } });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: missing.map(([title, headers]) => ({ range: `${title}!A1`, values: [headers] })) },
  });
}

export async function appendAuditStart(replacementId: string, fromProductId: string, toProductId: string, actor: string, startedAt: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `${AUDIT_TAB}!A:H`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[replacementId, fromProductId, toProductId, actor, startedAt, "", "running", ""]] },
  });
}

export async function appendAuditRows(replacementId: string, edits: readonly CellEdit[], appliedAt: string): Promise<void> {
  if (!edits.length) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `${AUDIT_ROWS_TAB}!A:G`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: edits.map((e) => [replacementId, e.sheet, e.rowNumber, e.column, e.oldValue, e.newValue, appliedAt]) },
  });
}

export async function finishAudit(replacementId: string, status: "completed" | "partial", finishedAt: string, error = ""): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const ids = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${AUDIT_TAB}!A2:A` })).data.values ?? [];
  const index = ids.findIndex((row) => text(row[0]) === replacementId);
  if (index < 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${AUDIT_TAB}!F${index + 2}:H${index + 2}`, valueInputOption: "RAW",
    requestBody: { values: [[finishedAt, status, error]] },
  });
}

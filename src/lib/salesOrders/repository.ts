import { parseDiscountJson } from "../discounts";
// Sales Orders — Google Sheets repository and column contract.
// The Next.js server writes the authoritative tabs directly through the same
// authenticated Sheets client used by the rest of the application. This module
// owns both the row mapping and the small, constrained write boundary.

import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { parseSheetNumber } from "@/lib/sheets.utils";
import { commandReplay, versionConflict } from "./errors.ts";
import type {
  SalesOrder, SalesOrderItem, SalesOrderHistory, SalesOrderDocument,
  SalesOrderFulfillment, SalesOrderDocumentLink, SalesOrderSequence,
  SalesOrderCommandReceipt, SalesOrderImportMap,
} from "@/types/salesOrder";

export const TAB_ORDERS = "SalesOrders";
export const TAB_ITEMS = "SalesOrderItems";
export const TAB_HISTORY = "SalesOrderHistory";
export const TAB_DOCUMENTS = "SalesOrderDocuments";
export const TAB_FULFILLMENTS = "SalesOrderFulfillments";
export const TAB_DOCUMENT_LINKS = "SalesOrderDocumentLinks";
export const TAB_SEQUENCES = "SalesOrderSequences";
export const TAB_COMMANDS = "SalesOrderCommands";
export const TAB_IMPORT_MAP = "SalesOrderImportMap";

export const ORDERS_HEADERS: readonly string[] = [
  "SalesOrderId", "SalesOrderNo", "LegacyTrackerNo", "ReceivedDate", "CustomerId",
  "CustomerNameSnapshot", "CustomerTINSnapshot", "BillingAddressSnapshot", "ContactId",
  "ContactNameSnapshot", "ContactPhoneSnapshot", "DeliveryAddressSnapshot", "CustomerPONo",
  "QuotationNo", "PaymentTermId", "PaymentTermsSnapshot", "RequiredDate", "AssignedToUserId",
  "Currency", "OrderStatus", "FulfillmentStatus", "SubtotalExTax", "DiscountTotal", "TaxTotal",
  "GrandTotal", "Remarks", "Version", "ConfirmedAt", "ClosedAt", "CancelReason", "ImportQuality",
  "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy", "DiscountSettings",
];

export const ITEMS_HEADERS: readonly string[] = [
  "SalesOrderItemId", "SalesOrderId", "LineNo", "OrderCategory", "LineType", "ProductId",
  "ProductCodeSnapshot", "ProductNameSnapshot", "CustomerProductNameSnapshot", "Description",
  "UnitId", "UnitSnapshot", "Quantity", "UnitPrice", "PriceSource", "CustomerProductPriceId",
  "QuotationLineReference", "DiscountAmount", "TaxMode", "TaxRate", "SubtotalExTax", "TaxAmount",
  "LineTotal", "FulfilledQty", "CancelledQty", "LineStatus", "PriceOverrideReason", "CreatedAt",
  "CreatedBy", "UpdatedAt", "UpdatedBy", "DiscountSettings",
];

export const HISTORY_HEADERS: readonly string[] = [
  "EventId", "SalesOrderId", "SalesOrderItemId", "EventType", "FromStatus", "ToStatus",
  "ChangedFieldsJson", "Reason", "CommandId", "ActorUserId", "CreatedAt",
];

export const DOCUMENTS_HEADERS: readonly string[] = [
  "DocumentId", "SalesOrderId", "DocumentType", "ExternalDocumentNo", "DriveFileId", "ExternalUrl",
  "FileName", "MimeType", "OrderVersion", "GenerationStatus", "ErrorCode", "CreatedAt", "CreatedBy",
];

export const FULFILLMENTS_HEADERS: readonly string[] = [
  "FulfillmentId", "SalesOrderId", "SalesOrderItemId", "FulfillmentType", "SourceDocumentType",
  "SourceDocumentId", "SourceLineId", "Quantity", "EffectiveDate", "EvidenceDriveFileId",
  "ReversesFulfillmentId", "Status", "CommandId", "CreatedAt", "CreatedBy",
];

export const DOCUMENT_LINKS_HEADERS: readonly string[] = [
  "LinkId", "SalesOrderId", "SalesOrderItemId", "DocumentType", "DocumentId", "DocumentLineId",
  "LinkedQty", "LinkStatus", "CommandId", "CreatedAt", "CreatedBy",
];

export const SEQUENCES_HEADERS: readonly string[] = ["SequenceKey", "Prefix", "BusinessYear", "LastNumber", "UpdatedAt"];
export const COMMANDS_HEADERS: readonly string[] = ["CommandId", "PayloadHash", "CommandType", "SalesOrderId", "ResultVersion", "ResultJson", "CommittedAt", "ActorUserId"];
export const IMPORT_MAP_HEADERS: readonly string[] = [
  "ImportKey", "SourceSpreadsheetId", "SourceSheetId", "SourceRow", "SourceTrackerNo", "SourceHash",
  "TargetSalesOrderId", "TargetSalesOrderItemId", "ImportBatchId", "ImportStatus", "IssueCodes", "ImportedAt",
];

export const TAB_HEADERS: Record<string, readonly string[]> = {
  [TAB_ORDERS]: ORDERS_HEADERS,
  [TAB_ITEMS]: ITEMS_HEADERS,
  [TAB_HISTORY]: HISTORY_HEADERS,
  [TAB_DOCUMENTS]: DOCUMENTS_HEADERS,
  [TAB_FULFILLMENTS]: FULFILLMENTS_HEADERS,
  [TAB_DOCUMENT_LINKS]: DOCUMENT_LINKS_HEADERS,
  [TAB_SEQUENCES]: SEQUENCES_HEADERS,
  [TAB_COMMANDS]: COMMANDS_HEADERS,
  [TAB_IMPORT_MAP]: IMPORT_MAP_HEADERS,
};

/** End column A1 reference for a header count, e.g. 34 -> AH. */
export function headerEndColumn(count: number): string {
  let label = "";
  let n = count - 1;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}
const text = (value: unknown): string => String(value ?? "").trim();
const num = (value: unknown): number => parseSheetNumber(value);
const nullableNum = (value: unknown): number | null => {
  const trimmed = text(value);
  return trimmed === "" ? null : num(trimmed);
};

export function orderFromRow(row: unknown[]): SalesOrder {
  const r = row.length >= 34 ? row : [...row, ...Array<unknown>(34 - row.length).fill("")];
  return {
    discountSettings: parseDiscountJson(r[35]),
    salesOrderId: text(r[0]), salesOrderNo: text(r[1]), legacyTrackerNo: text(r[2]),
    receivedDate: text(r[3]), customerId: text(r[4]), customerNameSnapshot: text(r[5]),
    customerTINSnapshot: text(r[6]), billingAddressSnapshot: text(r[7]), contactId: text(r[8]),
    contactNameSnapshot: text(r[9]), contactPhoneSnapshot: text(r[10]), deliveryAddressSnapshot: text(r[11]),
    customerPONo: text(r[12]), quotationNo: text(r[13]), paymentTermId: text(r[14]),
    paymentTermsSnapshot: text(r[15]), requiredDate: text(r[16]), assignedToUserId: text(r[17]),
    currency: (text(r[18]) || "PHP") as SalesOrder["currency"],
    orderStatus: (text(r[19]) || "DRAFT") as SalesOrder["orderStatus"],
    fulfillmentStatus: (text(r[20]) || "UNFULFILLED") as SalesOrder["fulfillmentStatus"], subtotalExTax: num(r[21]), discountTotal: num(r[22]),
    taxTotal: num(r[23]), grandTotal: num(r[24]), remarks: text(r[25]), version: num(r[26]),
    confirmedAt: text(r[27]), closedAt: text(r[28]), cancelReason: text(r[29]),
    importQuality: (text(r[30]) || "") as SalesOrder["importQuality"], createdAt: text(r[31]), createdBy: text(r[32]),
    updatedAt: text(r[33]), updatedBy: text(r[34]),
  };
}

export function itemFromRow(row: unknown[]): SalesOrderItem {
  const r = row.length >= 31 ? row : [...row, ...Array<unknown>(31 - row.length).fill("")];
  return {
    discountSettings: parseDiscountJson(r[31]),
    salesOrderItemId: text(r[0]), salesOrderId: text(r[1]), lineNo: num(r[2]),
    orderCategory: text(r[3]), lineType: text(r[4]) === "SERVICE" ? "SERVICE" : "PRODUCT",
    productId: text(r[5]), productCodeSnapshot: text(r[6]), productNameSnapshot: text(r[7]),
    customerProductNameSnapshot: text(r[8]), description: text(r[9]), unitId: text(r[10]),
    unitSnapshot: text(r[11]), quantity: nullableNum(r[12]), unitPrice: nullableNum(r[13]),
    priceSource: (text(r[14]) || "DEFAULT_PRICE") as SalesOrderItem["priceSource"], customerProductPriceId: text(r[15]),
    quotationLineReference: text(r[16]), discountAmount: num(r[17]), taxMode: (text(r[18]) || "VAT_INCLUSIVE") as SalesOrderItem["taxMode"],
    taxRate: num(r[19]), subtotalExTax: num(r[20]), taxAmount: num(r[21]), lineTotal: num(r[22]),
    fulfilledQty: num(r[23]), cancelledQty: num(r[24]), lineStatus: (text(r[25]) || "ACTIVE") as SalesOrderItem["lineStatus"],
    priceOverrideReason: text(r[26]), createdAt: text(r[27]), createdBy: text(r[28]),
    updatedAt: text(r[29]), updatedBy: text(r[30]),
  };
}
export function historyFromRow(row: unknown[]): SalesOrderHistory {
  return {
    eventId: text(row[0]), salesOrderId: text(row[1]), salesOrderItemId: text(row[2]),
    eventType: text(row[3]), fromStatus: text(row[4]), toStatus: text(row[5]),
    changedFieldsJson: text(row[6]), reason: text(row[7]), commandId: text(row[8]),
    actorUserId: text(row[9]), createdAt: text(row[10]),
  };
}

export function fulfillmentFromRow(row: unknown[]): SalesOrderFulfillment {
  return {
    fulfillmentId: text(row[0]), salesOrderId: text(row[1]), salesOrderItemId: text(row[2]),
    fulfillmentType: text(row[3]) === "REVERSAL" ? "REVERSAL" : text(row[3]) === "SERVICE_COMPLETION" ? "SERVICE_COMPLETION" : "DELIVERY",
    sourceDocumentType: text(row[4]), sourceDocumentId: text(row[5]), sourceLineId: text(row[6]),
    quantity: num(row[7]), effectiveDate: text(row[8]), evidenceDriveFileId: text(row[9]),
    reversesFulfillmentId: text(row[10]), status: (text(row[11]) || "POSTED") as SalesOrderFulfillment["status"],
    commandId: text(row[12]), createdAt: text(row[13]), createdBy: text(row[14]),
  };
}

export function documentFromRow(row: unknown[]): SalesOrderDocument {
  return {
    documentId: text(row[0]), salesOrderId: text(row[1]),
    documentType: text(row[2]) as SalesOrderDocument["documentType"],
    externalDocumentNo: text(row[3]), driveFileId: text(row[4]), externalUrl: text(row[5]),
    fileName: text(row[6]), mimeType: text(row[7]), orderVersion: num(row[8]),
    generationStatus: (text(row[9]) || "PENDING") as SalesOrderDocument["generationStatus"], errorCode: text(row[10]),
    createdAt: text(row[11]), createdBy: text(row[12]),
  };
}

export function documentLinkFromRow(row: unknown[]): SalesOrderDocumentLink {
  return {
    linkId: text(row[0]), salesOrderId: text(row[1]), salesOrderItemId: text(row[2]),
    documentType: text(row[3]) as SalesOrderDocumentLink["documentType"], documentId: text(row[4]), documentLineId: text(row[5]),
    linkedQty: num(row[6]), linkStatus: (text(row[7]) || "LINKED") as SalesOrderDocumentLink["linkStatus"], commandId: text(row[8]),
    createdAt: text(row[9]), createdBy: text(row[10]),
  };
}

export function sequenceFromRow(row: unknown[]): SalesOrderSequence {
  return {
    sequenceKey: text(row[0]), prefix: text(row[1]), businessYear: text(row[2]),
    lastNumber: num(row[3]), updatedAt: text(row[4]),
  };
}

export function importMapFromRow(row: unknown[]): SalesOrderImportMap {
  return {
    importKey: text(row[0]), sourceSpreadsheetId: text(row[1]), sourceSheetId: text(row[2]),
    sourceRow: num(row[3]), sourceTrackerNo: text(row[4]), sourceHash: text(row[5]),
    targetSalesOrderId: text(row[6]), targetSalesOrderItemId: text(row[7]), importBatchId: text(row[8]),
    importStatus: (text(row[9]) || "PENDING") as SalesOrderImportMap["importStatus"], issueCodes: text(row[10]), importedAt: text(row[11]),
  };
}
export function orderToRow(order: SalesOrder): Array<string | number | null> {
  return [
    order.salesOrderId, order.salesOrderNo, order.legacyTrackerNo, order.receivedDate, order.customerId,
    order.customerNameSnapshot, order.customerTINSnapshot, order.billingAddressSnapshot, order.contactId,
    order.contactNameSnapshot, order.contactPhoneSnapshot, order.deliveryAddressSnapshot, order.customerPONo,
    order.quotationNo, order.paymentTermId, order.paymentTermsSnapshot, order.requiredDate, order.assignedToUserId,
    order.currency, order.orderStatus, order.fulfillmentStatus, order.subtotalExTax, order.discountTotal,
    order.taxTotal, order.grandTotal, order.remarks, order.version, order.confirmedAt, order.closedAt,
    order.cancelReason, order.importQuality, order.createdAt, order.createdBy, order.updatedAt, order.updatedBy, order.discountSettings ? JSON.stringify(order.discountSettings) : "",
  ];
}

export function itemToRow(item: SalesOrderItem): Array<string | number | null> {
  return [
    item.salesOrderItemId, item.salesOrderId, item.lineNo, item.orderCategory, item.lineType, item.productId,
    item.productCodeSnapshot, item.productNameSnapshot, item.customerProductNameSnapshot, item.description,
    item.unitId, item.unitSnapshot, item.quantity, item.unitPrice, item.priceSource, item.customerProductPriceId,
    item.quotationLineReference, item.discountAmount, item.taxMode, item.taxRate, item.subtotalExTax,
    item.taxAmount, item.lineTotal, item.fulfilledQty, item.cancelledQty, item.lineStatus,
    item.priceOverrideReason, item.createdAt, item.createdBy, item.updatedAt, item.updatedBy, item.discountSettings ? JSON.stringify(item.discountSettings) : "",
  ];
}

export function historyToRow(entry: SalesOrderHistory): Array<unknown> {
  return [
    entry.eventId, entry.salesOrderId, entry.salesOrderItemId, entry.eventType, entry.fromStatus, entry.toStatus,
    entry.changedFieldsJson, entry.reason, entry.commandId, entry.actorUserId, entry.createdAt,
  ];
}

export function fulfillmentToRow(entry: SalesOrderFulfillment): Array<unknown> {
  return [
    entry.fulfillmentId, entry.salesOrderId, entry.salesOrderItemId, entry.fulfillmentType,
    entry.sourceDocumentType, entry.sourceDocumentId, entry.sourceLineId, entry.quantity, entry.effectiveDate,
    entry.evidenceDriveFileId, entry.reversesFulfillmentId, entry.status, entry.commandId, entry.createdAt, entry.createdBy,
  ];
}

export function documentToRow(doc: SalesOrderDocument): Array<unknown> {
  return [
    doc.documentId, doc.salesOrderId, doc.documentType, doc.externalDocumentNo, doc.driveFileId, doc.externalUrl,
    doc.fileName, doc.mimeType, doc.orderVersion, doc.generationStatus, doc.errorCode, doc.createdAt, doc.createdBy,
  ];
}

export function documentLinkToRow(link: SalesOrderDocumentLink): Array<unknown> {
  return [
    link.linkId, link.salesOrderId, link.salesOrderItemId, link.documentType, link.documentId, link.documentLineId,
    link.linkedQty, link.linkStatus, link.commandId, link.createdAt, link.createdBy,
  ];
}

export function sequenceToRow(seq: SalesOrderSequence): Array<unknown> {
  return [seq.sequenceKey, seq.prefix, seq.businessYear, seq.lastNumber, seq.updatedAt];
}

export function commandReceiptToRow(receipt: SalesOrderCommandReceipt): Array<unknown> {
  return [
    receipt.commandId, receipt.payloadHash, receipt.commandType, receipt.salesOrderId, receipt.resultVersion,
    receipt.resultJson, receipt.committedAt, receipt.actorUserId,
  ];
}

export function importMapToRow(map: SalesOrderImportMap): Array<unknown> {
  return [
    map.importKey, map.sourceSpreadsheetId, map.sourceSheetId, map.sourceRow, map.sourceTrackerNo,
    map.sourceHash, map.targetSalesOrderId, map.targetSalesOrderItemId, map.importBatchId,
    map.importStatus, map.issueCodes, map.importedAt,
  ];
}
async function readTabValues(tab: string): Promise<unknown[][]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const end = headerEndColumn(TAB_HEADERS[tab].length);
  const response = await withSheetsReadRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:${end}`,
  }));
  return response.data.values ?? [];
}

function isReadQuotaError(error: unknown): boolean {
  const candidate = error as { code?: number; response?: { status?: number; data?: { error?: { status?: string; message?: string } } }; message?: string };
  const status = candidate.response?.status ?? candidate.code;
  const message = candidate.response?.data?.error?.message ?? candidate.message ?? "";
  return status === 429 || /quota exceeded|rate limit/i.test(message);
}

async function withSheetsReadRetry<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [1000, 2000, 4000, 8000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isReadQuotaError(error) || attempt >= delays.length) throw error;
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, delays[attempt] + jitter));
    }
  }
}

async function readTabsValues(tabs: readonly string[]): Promise<Map<string, unknown[][]>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const ranges = tabs.map((tab) => `${tab}!A2:${headerEndColumn(TAB_HEADERS[tab].length)}`);
  const result = new Map<string, unknown[][]>();
  if (typeof sheets.spreadsheets.values.batchGet === "function") {
    const response = await withSheetsReadRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges }));
    tabs.forEach((tab, index) => result.set(tab, response.data.valueRanges?.[index]?.values ?? []));
    return result;
  }

  // Compatibility for the lightweight Sheets adapter used by local tests.
  // The real googleapis client always provides batchGet.
  for (let index = 0; index < tabs.length; index += 1) {
    const response = await withSheetsReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: ranges[index] }));
    result.set(tabs[index], response.data.values ?? []);
  }
  return result;
}

export async function readSalesOrderListSnapshot(): Promise<{
  orders: SalesOrder[]; items: SalesOrderItem[];
}> {
  const values = await readTabsValues([TAB_ORDERS, TAB_ITEMS]);
  return {
    orders: (values.get(TAB_ORDERS) ?? []).map(orderFromRow).filter((order) => order.salesOrderId),
    items: (values.get(TAB_ITEMS) ?? []).map(itemFromRow).filter((item) => item.salesOrderItemId),
  };
}

export async function readSalesOrderDetailSnapshot(salesOrderId: string): Promise<{
  order: SalesOrder | null; items: SalesOrderItem[]; history: SalesOrderHistory[];
  documents: SalesOrderDocument[]; fulfillments: SalesOrderFulfillment[];
  documentLinks: SalesOrderDocumentLink[];
}> {
  const tabs = [TAB_ORDERS, TAB_ITEMS, TAB_HISTORY, TAB_DOCUMENTS, TAB_FULFILLMENTS, TAB_DOCUMENT_LINKS] as const;
  const values = await readTabsValues(tabs);
  const orders = (values.get(TAB_ORDERS) ?? []).map(orderFromRow);
  return {
    order: orders.find((order) => order.salesOrderId === salesOrderId) ?? null,
    items: (values.get(TAB_ITEMS) ?? []).map(itemFromRow).filter((item) => item.salesOrderId === salesOrderId && item.salesOrderItemId),
    history: (values.get(TAB_HISTORY) ?? []).map(historyFromRow).filter((entry) => entry.salesOrderId === salesOrderId && entry.eventId),
    documents: (values.get(TAB_DOCUMENTS) ?? []).map(documentFromRow).filter((doc) => doc.salesOrderId === salesOrderId && doc.documentId),
    fulfillments: (values.get(TAB_FULFILLMENTS) ?? []).map(fulfillmentFromRow).filter((entry) => entry.salesOrderId === salesOrderId && entry.fulfillmentId),
    documentLinks: (values.get(TAB_DOCUMENT_LINKS) ?? []).map(documentLinkFromRow).filter((link) => link.salesOrderId === salesOrderId && link.linkId),
  };
}

export async function readSalesOrders(): Promise<SalesOrder[]> {
  return (await readTabValues(TAB_ORDERS)).map(orderFromRow).filter((order) => order.salesOrderId);
}

export async function readSalesOrderById(salesOrderId: string): Promise<SalesOrder | null> {
  const order = (await readSalesOrders()).find((candidate) => candidate.salesOrderId === salesOrderId);
  return order ?? null;
}

export async function readSalesOrdersByIds(ids: readonly string[]): Promise<SalesOrder[]> {
  const all = await readSalesOrders();
  const wanted = new Set(ids);
  return all.filter((order) => wanted.has(order.salesOrderId));
}

export async function readSalesOrderItemsAll(): Promise<SalesOrderItem[]> {
  return (await readTabValues(TAB_ITEMS)).map(itemFromRow).filter((item) => item.salesOrderItemId);
}

export async function readSalesOrderItems(salesOrderId: string): Promise<SalesOrderItem[]> {
  return (await readSalesOrderItemsAll()).filter((item) => item.salesOrderId === salesOrderId);
}

export async function readSalesOrderHistoryAll(): Promise<SalesOrderHistory[]> {
  return (await readTabValues(TAB_HISTORY)).map(historyFromRow).filter((entry) => entry.eventId);
}

export async function readSalesOrderHistory(salesOrderId: string, limit = 50): Promise<SalesOrderHistory[]> {
  const entries = (await readSalesOrderHistoryAll()).filter((entry) => entry.salesOrderId === salesOrderId);
  return entries.slice(entries.length - limit);
}

export async function readSalesOrderDocuments(salesOrderId: string): Promise<SalesOrderDocument[]> {
  return (await readTabValues(TAB_DOCUMENTS)).map(documentFromRow).filter((doc) => doc.salesOrderId === salesOrderId && doc.documentId);
}

export async function readSalesOrderFulfillments(salesOrderId: string): Promise<SalesOrderFulfillment[]> {
  return (await readTabValues(TAB_FULFILLMENTS)).map(fulfillmentFromRow).filter((entry) => entry.salesOrderId === salesOrderId && entry.fulfillmentId);
}

export async function readSalesOrderFulfillmentsAll(): Promise<SalesOrderFulfillment[]> {
  return (await readTabValues(TAB_FULFILLMENTS)).map(fulfillmentFromRow).filter((entry) => entry.fulfillmentId);
}

export async function readSalesOrderDocumentLinks(salesOrderId: string): Promise<SalesOrderDocumentLink[]> {
  return (await readTabValues(TAB_DOCUMENT_LINKS)).map(documentLinkFromRow).filter((link) => link.salesOrderId === salesOrderId && link.linkId);
}

export async function readSalesOrderSequences(): Promise<SalesOrderSequence[]> {
  return (await readTabValues(TAB_SEQUENCES)).map(sequenceFromRow).filter((seq) => seq.sequenceKey);
}

export async function readSalesOrderImportMap(): Promise<SalesOrderImportMap[]> {
  return (await readTabValues(TAB_IMPORT_MAP)).map(importMapFromRow).filter((map) => map.importKey);
}

export interface HeaderVerificationResult {
  tab: string;
  missing: string[];
  unexpected: string[];
  ok: boolean;
}

/** Read-only header verification usable as a provisioning gate. */
export async function verifySalesOrderHeaders(): Promise<HeaderVerificationResult[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const results: HeaderVerificationResult[] = [];
  for (const [tab, headers] of Object.entries(TAB_HEADERS)) {
    const end = headerEndColumn(headers.length);
    let actual: string[] = [];
    try {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:${end}1` });
      actual = (response.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
    } catch {
      results.push({ tab, missing: [...headers], unexpected: [], ok: false });
      continue;
    }
    const missing = headers.filter((expected) => !actual.includes(expected));
    const unexpected = actual.filter((cell) => cell && !headers.includes(cell));
    results.push({ tab, missing, unexpected, ok: missing.length === 0 && unexpected.length === 0 });
  }
  return results;
}

export async function assertSalesOrderHeadersReady(): Promise<void> {
  const results = await verifySalesOrderHeaders();
  const problems = results.filter((result) => !result.ok);
  if (problems.length > 0) {
    const detail = problems.map((p) => `${p.tab}: missing=[${p.missing.join(",")}]`).join("; ");
    throw new Error(`Sales Order tabs are not provisioned: ${detail}`);
  }
}

type DirectWritePayload = {
  salesOrderId?: string;
  receivedDate?: string;
  order?: SalesOrder;
  items?: SalesOrderItem[];
  history?: SalesOrderHistory[];
  fulfillments?: SalesOrderFulfillment[];
  document?: SalesOrderDocument;
  links?: SalesOrderDocumentLink[];
  hadItems?: boolean;
};

export interface DirectWriteCommand {
  commandId: string;
  commandType: string;
  salesOrderId: string | null;
  expectedVersion: number | null;
  actorUserId: string;
  requestHash: string;
  payload: DirectWritePayload;
}

export interface DirectWriteResult<T> {
  ok: true;
  replayed: boolean;
  result: T;
}

// A Google Sheet is not a relational database. This queue serializes requests
// handled by the same Next.js instance, while version checks reject a stale
// request if another instance or a human changed the order in the meantime.
let writeQueue: Promise<void> = Promise.resolve();

async function withDirectWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function lastDataRow(values: unknown[][]): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index].some((value) => value !== "" && value !== null && value !== undefined)) return index + 2;
  }
  return 1;
}

function normalizeRow(row: readonly unknown[], width: number): unknown[] {
  return [...row.slice(0, width), ...Array(Math.max(0, width - row.length)).fill("")];
}

function commandResult(commandType: string, payload: DirectWritePayload, order: SalesOrder | undefined): Record<string, unknown> {
  if (commandType === "so.attach") {
    return { salesOrderId: payload.salesOrderId ?? payload.document?.salesOrderId ?? "", version: order?.version ?? 0,
      documentId: payload.document?.documentId ?? "", document: payload.document, applied: true };
  }
  if (commandType === "so.documents.link") {
    return { salesOrderId: payload.salesOrderId ?? "", version: order?.version ?? 0,
      linkCount: payload.links?.length ?? 0, links: payload.links ?? [], applied: true };
  }
  return { salesOrderId: order?.salesOrderId ?? payload.salesOrderId ?? "", version: order?.version ?? 0,
    salesOrderNo: order?.salesOrderNo ?? "", applied: true };
}

/**
 * Applies one constrained Sales Order command directly to its canonical tabs.
 * All source ranges and its idempotency receipt are sent in one Sheets values
 * batch. There is deliberately no arbitrary-range API exposed to callers.
 */
export async function writeSalesOrderCommand<T = Record<string, unknown>>(
  command: DirectWriteCommand,
): Promise<DirectWriteResult<T>> {
  return withDirectWriteLock(async () => {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const tabs = [TAB_ORDERS, TAB_ITEMS, TAB_HISTORY, TAB_DOCUMENTS, TAB_FULFILLMENTS, TAB_DOCUMENT_LINKS, TAB_SEQUENCES, TAB_COMMANDS] as const;
    const ranges = tabs.map((tab) => `${tab}!A2:${headerEndColumn(TAB_HEADERS[tab].length)}`);
    const read = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
    const source = new Map<string, unknown[][]>();
    tabs.forEach((tab, index) => source.set(tab, read.data.valueRanges?.[index]?.values ?? []));

    const commands = source.get(TAB_COMMANDS) ?? [];
    const prior = commands.find((row) => text(row[0]) === command.commandId);
    if (prior) {
      if (text(prior[1]) !== command.requestHash || text(prior[7]) !== command.actorUserId) {
        throw commandReplay("Command ID was already used with different content.");
      }
      return { ok: true, replayed: true, result: JSON.parse(text(prior[5])) as T };
    }

    const payload = command.payload;
    const orderId = payload.order?.salesOrderId ?? payload.salesOrderId ?? command.salesOrderId ?? "";
    const orders = source.get(TAB_ORDERS) ?? [];
    const existingIndex = orders.findIndex((row) => text(row[0]) === orderId);
    const existing = existingIndex >= 0 ? orderFromRow(orders[existingIndex]) : null;
    const isCreate = command.commandType === "so.create";
    if (isCreate && existing) throw commandReplay("Sales Order already exists; create cannot target an existing order.");
    if (!isCreate) {
      if (!existing) throw new Error(`Sales Order ${orderId} was not found.`);
      if (command.expectedVersion !== null && command.expectedVersion !== existing.version) {
        throw versionConflict("Version conflict: the order changed since it was loaded.", existing.version);
      }
    }

    const nextOrder = payload.order ? { ...payload.order } : existing ?? undefined;
    let sequenceUpdate: { rowNumber: number; row: unknown[] } | undefined;
    if (nextOrder && (isCreate || ["so.update", "so.confirm", "so.hold", "so.resume", "so.cancel", "so.close", "so.fulfill"].includes(command.commandType))) {
      nextOrder.version = isCreate ? Math.max(1, nextOrder.version || 1) : (existing?.version ?? 0) + 1;
      if (nextOrder.orderStatus === "CONFIRMED" && !nextOrder.salesOrderNo) {
        const businessYear = String(payload.receivedDate ?? nextOrder.receivedDate).slice(0, 4);
        if (!/^\d{4}$/.test(businessYear)) throw new Error("Confirmed Sales Orders require a valid received date.");
        const sequenceKey = `AIC-SO-${businessYear}`;
        const sequences = source.get(TAB_SEQUENCES) ?? [];
        const sequenceIndex = sequences.findIndex((row) => text(row[0]) === sequenceKey);
        const lastNumber = sequenceIndex >= 0 ? num(sequences[sequenceIndex][3]) : 0;
        const nextNumber = lastNumber + 1;
        nextOrder.salesOrderNo = `${sequenceKey}-${String(nextNumber).padStart(4, "0")}`;
        const sequenceRow: SalesOrderSequence = { sequenceKey, prefix: "AIC-SO", businessYear, lastNumber: nextNumber, updatedAt: new Date().toISOString() };
        const rowNumber = sequenceIndex >= 0 ? sequenceIndex + 2 : lastDataRow(sequences) + 1;
        sequenceUpdate = { rowNumber, row: sequenceToRow(sequenceRow) };
      }
    }

    const updates: Array<{ range: string; values: unknown[][] }> = [];
    if (nextOrder && (isCreate || payload.order && command.commandType !== "so.attach" && command.commandType !== "so.documents.link")) {
      const rowNumber = isCreate ? lastDataRow(orders) + 1 : existingIndex + 2;
      updates.push({ range: `${TAB_ORDERS}!A${rowNumber}:${headerEndColumn(ORDERS_HEADERS.length)}${rowNumber}`, values: [orderToRow(nextOrder)] });
    }
    const shouldWriteItems = isCreate || command.commandType !== "so.update" || payload.hadItems === true;
    if (shouldWriteItems && payload.items) {
      const itemRows = source.get(TAB_ITEMS) ?? [];
      const byId = new Map(itemRows.map((row, index) => [text(row[0]), index + 2]));
      let nextRow = lastDataRow(itemRows) + 1;
      for (const item of payload.items) {
        const rowNumber = byId.get(item.salesOrderItemId) ?? nextRow++;
        updates.push({ range: `${TAB_ITEMS}!A${rowNumber}:${headerEndColumn(ITEMS_HEADERS.length)}${rowNumber}`, values: [itemToRow(item)] });
      }
    }
    const append = (tab: string, rows: unknown[][], width: number) => {
      if (!rows.length) return;
      const current = source.get(tab) ?? [];
      const start = lastDataRow(current) + 1;
      updates.push({ range: `${tab}!A${start}:${headerEndColumn(width)}${start + rows.length - 1}`, values: rows.map((row) => normalizeRow(row, width)) });
    };
    append(TAB_HISTORY, (payload.history ?? []).map(historyToRow), HISTORY_HEADERS.length);
    append(TAB_FULFILLMENTS, (payload.fulfillments ?? []).map(fulfillmentToRow), FULFILLMENTS_HEADERS.length);
    if (payload.document) append(TAB_DOCUMENTS, [documentToRow(payload.document)], DOCUMENTS_HEADERS.length);
    append(TAB_DOCUMENT_LINKS, (payload.links ?? []).map(documentLinkToRow), DOCUMENT_LINKS_HEADERS.length);

    if (sequenceUpdate) {
      updates.push({ range: `${TAB_SEQUENCES}!A${sequenceUpdate.rowNumber}:E${sequenceUpdate.rowNumber}`, values: [sequenceUpdate.row] });
    }
    const result = commandResult(command.commandType, payload, nextOrder);
    const receipt: SalesOrderCommandReceipt = {
      commandId: command.commandId, payloadHash: command.requestHash, commandType: command.commandType,
      salesOrderId: orderId, resultVersion: Number(result.version ?? 0), resultJson: JSON.stringify(result),
      committedAt: new Date().toISOString(), actorUserId: command.actorUserId,
    };
    append(TAB_COMMANDS, [commandReceiptToRow(receipt)], COMMANDS_HEADERS.length);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
    return { ok: true, replayed: false, result: result as T };
  });
}

/** Removes a never-confirmed draft and its dependent rows from the canonical store. */
export async function deleteDraftSalesOrderRows(salesOrderId: string): Promise<void> {
  await withDirectWriteLock(async () => {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const tabs = [TAB_ORDERS, TAB_ITEMS, TAB_HISTORY, TAB_DOCUMENTS, TAB_FULFILLMENTS, TAB_DOCUMENT_LINKS] as const;
    const ranges = tabs.map((tab) => `${tab}!A2:${headerEndColumn(TAB_HEADERS[tab].length)}`);
    const read = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
    const rowsByTab = new Map<string, unknown[][]>();
    tabs.forEach((tab, index) => rowsByTab.set(tab, read.data.valueRanges?.[index]?.values ?? []));

    const orderRows = rowsByTab.get(TAB_ORDERS) ?? [];
    const orderIndex = orderRows.findIndex((row) => text(row[0]) === salesOrderId);
    if (orderIndex < 0) throw new Error(`Sales Order ${salesOrderId} was not found.`);
    const order = orderFromRow(orderRows[orderIndex]);
    if (order.orderStatus !== "DRAFT") throw new Error("Only draft Sales Orders can be deleted.");

    const clearRanges: string[] = [`${TAB_ORDERS}!A${orderIndex + 2}:${headerEndColumn(ORDERS_HEADERS.length)}${orderIndex + 2}`];
    for (const tab of tabs.slice(1)) {
      const width = TAB_HEADERS[tab].length;
      (rowsByTab.get(tab) ?? []).forEach((row, index) => {
        if (text(row[1]) === salesOrderId) clearRanges.push(`${tab}!A${index + 2}:${headerEndColumn(width)}${index + 2}`);
      });
    }
    await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: clearRanges } });
  });
}

/** Used by the service to restore a response after a lost HTTP response. */
export async function readSalesOrderCommandResult<T>(commandId: string, requestHash: string, actorUserId: string): Promise<T | null> {
  const rows = await readTabValues(TAB_COMMANDS);
  const prior = rows.find((row) => text(row[0]) === commandId);
  if (!prior) return null;
  if (text(prior[1]) !== requestHash || text(prior[7]) !== actorUserId) {
    throw commandReplay("Command ID was already used with different content.");
  }
  return JSON.parse(text(prior[5])) as T;
}

// Sales Orders — Sheets repository (READ layer + column contract).
// Writes NEVER execute here: every mutation is serialized by the Apps Script
// gateway (src/lib/salesOrders/gateway.ts) so concurrency is enforced. This
// module owns the authoritative-tab column mapping and row <-> entity mappers
// shared with the gateway/writer and migration tooling.

import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { parseSheetNumber } from "@/lib/sheets.utils";
import type {
  SalesOrder, SalesOrderItem, SalesOrderHistory, SalesOrderDocument,
  SalesOrderFulfillment, SalesOrderDocumentLink, SalesOrderSequence,
  SalesOrderCommandReceipt, SalesOrderSyncJob, SalesOrderSyncMap, SalesOrderImportMap,
} from "@/types/salesOrder";

export const TAB_ORDERS = "SalesOrders";
export const TAB_ITEMS = "SalesOrderItems";
export const TAB_HISTORY = "SalesOrderHistory";
export const TAB_DOCUMENTS = "SalesOrderDocuments";
export const TAB_FULFILLMENTS = "SalesOrderFulfillments";
export const TAB_DOCUMENT_LINKS = "SalesOrderDocumentLinks";
export const TAB_SEQUENCES = "SalesOrderSequences";
export const TAB_COMMANDS = "SalesOrderCommands";
export const TAB_SYNC_JOBS = "SalesOrderSyncJobs";
export const TAB_SYNC_MAP = "SalesOrderSyncMap";
export const TAB_IMPORT_MAP = "SalesOrderImportMap";

export const ORDERS_HEADERS: readonly string[] = [
  "SalesOrderId", "SalesOrderNo", "LegacyTrackerNo", "ReceivedDate", "CustomerId",
  "CustomerNameSnapshot", "CustomerTINSnapshot", "BillingAddressSnapshot", "ContactId",
  "ContactNameSnapshot", "ContactPhoneSnapshot", "DeliveryAddressSnapshot", "CustomerPONo",
  "QuotationNo", "PaymentTermId", "PaymentTermsSnapshot", "RequiredDate", "AssignedToUserId",
  "Currency", "OrderStatus", "FulfillmentStatus", "SubtotalExTax", "DiscountTotal", "TaxTotal",
  "GrandTotal", "Remarks", "Version", "ConfirmedAt", "ClosedAt", "CancelReason", "ImportQuality",
  "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy",
];

export const ITEMS_HEADERS: readonly string[] = [
  "SalesOrderItemId", "SalesOrderId", "LineNo", "OrderCategory", "LineType", "ProductId",
  "ProductCodeSnapshot", "ProductNameSnapshot", "CustomerProductNameSnapshot", "Description",
  "UnitId", "UnitSnapshot", "Quantity", "UnitPrice", "PriceSource", "CustomerProductPriceId",
  "QuotationLineReference", "DiscountAmount", "TaxMode", "TaxRate", "SubtotalExTax", "TaxAmount",
  "LineTotal", "FulfilledQty", "CancelledQty", "LineStatus", "PriceOverrideReason", "CreatedAt",
  "CreatedBy", "UpdatedAt", "UpdatedBy",
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
export const SYNC_JOBS_HEADERS: readonly string[] = [
  "SyncJobId", "SalesOrderId", "OrderVersion", "DestinationSpreadsheetId", "DestinationSheetId",
  "Status", "AttemptCount", "NextAttemptAt", "LastErrorCode", "LastErrorMessage", "LeaseToken",
  "LeaseOwner", "LeaseExpiresAt", "CreatedAt", "LastAttemptAt", "SyncedAt",
];
export const SYNC_MAP_HEADERS: readonly string[] = [
  "DestinationSpreadsheetId", "DestinationSheetId", "SalesOrderItemId", "SalesOrderId",
  "DestinationRowHint", "LastSyncedVersion", "LastSyncedHash", "LastSyncedAt",
];
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
  [TAB_SYNC_JOBS]: SYNC_JOBS_HEADERS,
  [TAB_SYNC_MAP]: SYNC_MAP_HEADERS,
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

export function syncJobFromRow(row: unknown[]): SalesOrderSyncJob {
  return {
    syncJobId: text(row[0]), salesOrderId: text(row[1]), orderVersion: num(row[2]),
    destinationSpreadsheetId: text(row[3]), destinationSheetId: text(row[4]),
    status: (text(row[5]) || "PENDING") as SalesOrderSyncJob["status"], attemptCount: num(row[6]), nextAttemptAt: text(row[7]),
    lastErrorCode: text(row[8]), lastErrorMessage: text(row[9]), leaseToken: text(row[10]),
    leaseOwner: text(row[11]), leaseExpiresAt: text(row[12]), createdAt: text(row[13]),
    lastAttemptAt: text(row[14]), syncedAt: text(row[15]),
  };
}

export function syncMapFromRow(row: unknown[]): SalesOrderSyncMap {
  return {
    destinationSpreadsheetId: text(row[0]), destinationSheetId: text(row[1]),
    salesOrderItemId: text(row[2]), salesOrderId: text(row[3]), destinationRowHint: num(row[4]),
    lastSyncedVersion: num(row[5]), lastSyncedHash: text(row[6]), lastSyncedAt: text(row[7]),
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
    order.cancelReason, order.importQuality, order.createdAt, order.createdBy, order.updatedAt, order.updatedBy,
  ];
}

export function itemToRow(item: SalesOrderItem): Array<string | number | null> {
  return [
    item.salesOrderItemId, item.salesOrderId, item.lineNo, item.orderCategory, item.lineType, item.productId,
    item.productCodeSnapshot, item.productNameSnapshot, item.customerProductNameSnapshot, item.description,
    item.unitId, item.unitSnapshot, item.quantity, item.unitPrice, item.priceSource, item.customerProductPriceId,
    item.quotationLineReference, item.discountAmount, item.taxMode, item.taxRate, item.subtotalExTax,
    item.taxAmount, item.lineTotal, item.fulfilledQty, item.cancelledQty, item.lineStatus,
    item.priceOverrideReason, item.createdAt, item.createdBy, item.updatedAt, item.updatedBy,
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

export function syncJobToRow(job: SalesOrderSyncJob): Array<unknown> {
  return [
    job.syncJobId, job.salesOrderId, job.orderVersion, job.destinationSpreadsheetId, job.destinationSheetId,
    job.status, job.attemptCount, job.nextAttemptAt, job.lastErrorCode, job.lastErrorMessage, job.leaseToken,
    job.leaseOwner, job.leaseExpiresAt, job.createdAt, job.lastAttemptAt, job.syncedAt,
  ];
}

export function syncMapToRow(map: SalesOrderSyncMap): Array<unknown> {
  return [
    map.destinationSpreadsheetId, map.destinationSheetId, map.salesOrderItemId, map.salesOrderId,
    map.destinationRowHint, map.lastSyncedVersion, map.lastSyncedHash, map.lastSyncedAt,
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
  orders: SalesOrder[]; items: SalesOrderItem[]; syncJobs: SalesOrderSyncJob[];
}> {
  const values = await readTabsValues([TAB_ORDERS, TAB_ITEMS, TAB_SYNC_JOBS]);
  return {
    orders: (values.get(TAB_ORDERS) ?? []).map(orderFromRow).filter((order) => order.salesOrderId),
    items: (values.get(TAB_ITEMS) ?? []).map(itemFromRow).filter((item) => item.salesOrderItemId),
    syncJobs: (values.get(TAB_SYNC_JOBS) ?? []).map(syncJobFromRow).filter((job) => job.syncJobId),
  };
}

export async function readSalesOrderDetailSnapshot(salesOrderId: string): Promise<{
  order: SalesOrder | null; items: SalesOrderItem[]; history: SalesOrderHistory[];
  documents: SalesOrderDocument[]; fulfillments: SalesOrderFulfillment[];
  documentLinks: SalesOrderDocumentLink[]; syncJobs: SalesOrderSyncJob[];
}> {
  const tabs = [TAB_ORDERS, TAB_ITEMS, TAB_HISTORY, TAB_DOCUMENTS, TAB_FULFILLMENTS, TAB_DOCUMENT_LINKS, TAB_SYNC_JOBS] as const;
  const values = await readTabsValues(tabs);
  const orders = (values.get(TAB_ORDERS) ?? []).map(orderFromRow);
  return {
    order: orders.find((order) => order.salesOrderId === salesOrderId) ?? null,
    items: (values.get(TAB_ITEMS) ?? []).map(itemFromRow).filter((item) => item.salesOrderId === salesOrderId && item.salesOrderItemId),
    history: (values.get(TAB_HISTORY) ?? []).map(historyFromRow).filter((entry) => entry.salesOrderId === salesOrderId && entry.eventId),
    documents: (values.get(TAB_DOCUMENTS) ?? []).map(documentFromRow).filter((doc) => doc.salesOrderId === salesOrderId && doc.documentId),
    fulfillments: (values.get(TAB_FULFILLMENTS) ?? []).map(fulfillmentFromRow).filter((entry) => entry.salesOrderId === salesOrderId && entry.fulfillmentId),
    documentLinks: (values.get(TAB_DOCUMENT_LINKS) ?? []).map(documentLinkFromRow).filter((link) => link.salesOrderId === salesOrderId && link.linkId),
    syncJobs: (values.get(TAB_SYNC_JOBS) ?? []).map(syncJobFromRow).filter((job) => job.salesOrderId === salesOrderId && job.syncJobId),
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

export async function readSalesOrderSyncJobs(): Promise<SalesOrderSyncJob[]> {
  return (await readTabValues(TAB_SYNC_JOBS)).map(syncJobFromRow).filter((job) => job.syncJobId);
}

export async function readSalesOrderSyncJobsForOrder(salesOrderId: string): Promise<SalesOrderSyncJob[]> {
  return (await readSalesOrderSyncJobs()).filter((job) => job.salesOrderId === salesOrderId);
}

export async function readSalesOrderSyncMap(): Promise<SalesOrderSyncMap[]> {
  return (await readTabValues(TAB_SYNC_MAP)).map(syncMapFromRow).filter((map) => map.salesOrderId || map.salesOrderItemId);
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

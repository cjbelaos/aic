// Sales Order domain types — authoritative schema for the Sales Orders module.
// This file is intentionally self-contained (no imports) so the pure logic
// modules in src/lib/salesOrders can be exercised by native-TypeScript test
// runners without aliases. All IDs are immutable UUIDs (crypto.randomUUID).
// Money is stored as numeric two-decimal currency amounts (integer-cent
// arithmetic lives in src/lib/salesOrders/money.ts). Dates are ISO YYYY-MM-DD;
// audit timestamps are UTC ISO-8601 strings.

export type OrderStatus = "DRAFT" | "CONFIRMED" | "ON_HOLD" | "CANCELLED" | "CLOSED";
export type FulfillmentStatus = "UNFULFILLED" | "PARTIAL" | "FULFILLED" | "NOT_APPLICABLE";
export type TaxMode = "VAT_INCLUSIVE" | "VAT_EXCLUSIVE" | "VAT_EXEMPT" | "ZERO_RATED";
export type LineType = "PRODUCT" | "SERVICE";
export type LineStatus = "ACTIVE" | "CANCELLED" | "INACTIVE";
/**
 * Where a line's price came from. `NOT_PRICED` is a descriptive line that has no
 * price of its own because the source quotation was quoted as one combined total
 * (single total price mode): quantity/unit still describe the work, `unitPrice`
 * stays blank, and the line contributes zero to the order totals instead of
 * inventing a divided share of the combined charge.
 */
export type PriceSource = "QUOTATION" | "CUSTOMER_PRICE" | "DEFAULT_PRICE" | "MANUAL" | "LEGACY" | "NOT_PRICED";

export type OrderCategory =
  | "Consumables"
  | "Services/ Repair"
  | "Project"
  | "Parts"
  | "Supplies"
  | "Treatment Package"
  | "PMS";
export type DocumentType = "CUSTOMER_PO" | "QUOTATION" | "SALES_ORDER_PDF" | "DELIVERY_RECEIPT" | "SERVICE_REPORT" | "OTHER";
export type GenerationStatus = "PENDING" | "READY" | "ERROR" | "SUPERSEDED";
export type FulfillmentType = "DELIVERY" | "SERVICE_COMPLETION" | "REVERSAL";
export type FulfillmentRowStatus = "DRAFT" | "POSTED" | "REVERSED";
export type SyncJobStatus = "PENDING" | "PROCESSING" | "RETRY" | "SYNCED" | "FAILED" | "SUPERSEDED";
export type ImportQuality = "" | "LEGACY_UNVERIFIED" | "REVIEW_REQUIRED" | "CLEAN";
export type DocumentLinkStatus = "LINKED" | "UNLINKED" | "REVERSED";
export type ImportStatus = "PENDING" | "IMPORTED" | "REVIEW" | "ANOMALY" | "REPAIRED" | "SKIPPED";
export type CurrencyCode = "PHP";

/** SalesOrders — one immutable-ID row per order. */
export interface SalesOrder {
  salesOrderId: string;
  /** Display reference AIC-SO-YYYY-NNNN; allocated only at confirmation. */
  salesOrderNo: string;
  /** Legacy Tracker No. kept separately searchable after migration. */
  legacyTrackerNo: string;
  receivedDate: string;
  customerId: string;
  customerNameSnapshot: string;
  customerTINSnapshot: string;
  billingAddressSnapshot: string;
  contactId: string;
  contactNameSnapshot: string;
  contactPhoneSnapshot: string;
  deliveryAddressSnapshot: string;
  /** Optional customer-issued reference; text; preserves leading zeros. */
  customerPONo: string;
  quotationNo: string;
  paymentTermId: string;
  paymentTermsSnapshot: string;
  requiredDate: string;
  assignedToUserId: string;
  currency: CurrencyCode;
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  /** Server-computed cached projections (cents-rounded). */
  subtotalExTax: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  remarks: string;
  /** Optimistic concurrency version; incremented on every mutation. */
  version: number;
  confirmedAt: string;
  closedAt: string;
  cancelReason: string;
  importQuality: ImportQuality;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** SalesOrderItems — one stable-ID row per line. */
export interface SalesOrderItem {
  salesOrderItemId: string;
  salesOrderId: string;
  lineNo: number;
  orderCategory: string;
  lineType: LineType;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  customerProductNameSnapshot: string;
  description: string;
  unitId: string;
  unitSnapshot: string;
  /** Null means unknown (legacy blanks) — never coerced to zero. */
  quantity: number | null;
  /** Null means unknown (legacy blanks) — never coerced to zero. */
  unitPrice: number | null;
  priceSource: PriceSource;
  customerProductPriceId: string;
  quotationLineReference: string;
  /** Fixed-amount line discount in currency. */
  discountAmount: number;
  taxMode: TaxMode;
  /** Decimal rate, e.g. 0.12 for 12%. */
  taxRate: number;
  /** Post-discount taxable base (excludes tax). */
  subtotalExTax: number;
  taxAmount: number;
  lineTotal: number;
  fulfilledQty: number;
  cancelledQty: number;
  lineStatus: LineStatus;
  priceOverrideReason: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** SalesOrderHistory — append-only business activity. */
export interface SalesOrderHistory {
  eventId: string;
  salesOrderId: string;
  salesOrderItemId: string;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  changedFieldsJson: string;
  reason: string;
  commandId: string;
  actorUserId: string;
  createdAt: string;
}

/** SalesOrderDocuments — reference and generation state. */
export interface SalesOrderDocument {
  documentId: string;
  salesOrderId: string;
  documentType: DocumentType;
  externalDocumentNo: string;
  driveFileId: string;
  externalUrl: string;
  fileName: string;
  mimeType: string;
  orderVersion: number;
  generationStatus: GenerationStatus;
  errorCode: string;
  createdAt: string;
  createdBy: string;
}

/** SalesOrderFulfillments — quantity evidence and reversals. */
export interface SalesOrderFulfillment {
  fulfillmentId: string;
  salesOrderId: string;
  salesOrderItemId: string;
  fulfillmentType: FulfillmentType;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceLineId: string;
  /** Positive magnitude; reversal sign comes from the type. */
  quantity: number;
  effectiveDate: string;
  evidenceDriveFileId: string;
  reversesFulfillmentId: string;
  status: FulfillmentRowStatus;
  commandId: string;
  createdAt: string;
  createdBy: string;
}

/** SalesOrderDocumentLinks — downstream document relationships (DRs, invoices). */
export interface SalesOrderDocumentLink {
  linkId: string;
  salesOrderId: string;
  salesOrderItemId: string;
  documentType: DocumentType;
  documentId: string;
  documentLineId: string;
  linkedQty: number;
  linkStatus: DocumentLinkStatus;
  commandId: string;
  createdAt: string;
  createdBy: string;
}

/** SalesOrderSequences — display number allocation (under the write lock). */
export interface SalesOrderSequence {
  sequenceKey: string;
  prefix: string;
  businessYear: string;
  lastNumber: number;
  updatedAt: string;
}

/** SalesOrderCommands — idempotency receipts. */
export interface SalesOrderCommandReceipt {
  commandId: string;
  payloadHash: string;
  commandType: string;
  salesOrderId: string;
  resultVersion: number;
  resultJson: string;
  committedAt: string;
  actorUserId: string;
}

export type SyncJobState = SyncJobStatus;

/** SalesOrderSyncJobs — durable outbound work in the authoritative workbook. */
export interface SalesOrderSyncJob {
  syncJobId: string;
  salesOrderId: string;
  orderVersion: number;
  destinationSpreadsheetId: string;
  destinationSheetId: string;
  status: SyncJobStatus;
  attemptCount: number;
  nextAttemptAt: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  leaseToken: string;
  leaseOwner: string;
  leaseExpiresAt: string;
  createdAt: string;
  lastAttemptAt: string;
  syncedAt: string;
}

/** SalesOrderSyncMap — destination reconciliation. */
export interface SalesOrderSyncMap {
  destinationSpreadsheetId: string;
  destinationSheetId: string;
  salesOrderItemId: string;
  salesOrderId: string;
  /** Optimization only: locate/verify the immutable line key before writing. */
  destinationRowHint: number;
  lastSyncedVersion: number;
  lastSyncedHash: string;
  lastSyncedAt: string;
}

/** SalesOrderImportMap — migration provenance (SourceRow is provenance only). */
export interface SalesOrderImportMap {
  importKey: string;
  sourceSpreadsheetId: string;
  sourceSheetId: string;
  sourceRow: number;
  sourceTrackerNo: string;
  sourceHash: string;
  targetSalesOrderId: string;
  targetSalesOrderItemId: string;
  importBatchId: string;
  importStatus: ImportStatus;
  issueCodes: string;
  importedAt: string;
}

export const SALES_ORDER_CATEGORIES: readonly OrderCategory[] = [
  "Consumables",
  "Services/ Repair",
  "Project",
  "Parts",
  "Supplies",
  "Treatment Package",
  "PMS",
];

export const SALES_ORDER_SO_NUMBER_PATTERN = /^AIC-SO-(\d{4})-(\d{4})$/;

/**
 * PriceSource value for a descriptive line covered by one combined quotation
 * charge. Value-level only — the SalesOrderItems column contract is unchanged.
 */
export const PRICE_SOURCE_NOT_PRICED: PriceSource = "NOT_PRICED";

/**
 * Application-layer category defaults. Service (including repair) lines always
 * belong to "Services/ Repair" and never ask the user for a category; product
 * lines default to "Parts". The Services/ Repair reporting view filters on this
 * value, so it must be assigned consistently for every service line.
 */
export const SALES_ORDER_SERVICE_CATEGORY = "Services/ Repair";
export const SALES_ORDER_PRODUCT_CATEGORY = "Parts";
export const SALES_ORDER_SHIPPING_CATEGORY = "Supplies";
/**
 * Category for the single combined charge line of a single-total quotation. It is
 * deliberately distinct so the charge is auditable and does not inflate the
 * Services/ Repair reporting view with a lump sum.
 */
export const SALES_ORDER_COMBINED_CATEGORY = "Project";

/** Line description used for the combined charge of a single-total quotation. */
export const COMBINED_CHARGE_DESCRIPTION = "Combined total as quoted";

/** Line description used for a quotation shipping fee carried into an order. */
export const SHIPPING_LINE_DESCRIPTION = "Shipping Fee";


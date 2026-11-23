export interface DeliveryItem {
  /** Stable child-row key; required when this item is used as fulfillment evidence. */
  deliveryReceiptItemId?: string;
  /** Immutable Sales Order line key when the release was created from an SO. */
  salesOrderItemId?: string;
  productId?: string;
  productCode: string;
  unit: string;
  description: string;
  quantity: number;
  /** Serial numbers delivered on this line (DeliveryReceiptItems column K). */
  serialNumbers?: string[];
  /** Warehouses this line's quantity is taken from (column L). Empty = all from the DR's default warehouse. */
  sources?: WarehouseSource[];
}

/** One warehouse part of a DR line. Same shape as WarehouseSource in src/lib/deliverySources.ts. */
export interface WarehouseSource {
  warehouseId: string;
  quantity: number;
}

/** One contract entitlement released on a DR line (server appends a ContractReleases row). */
export interface ContractLine {
  contractItemId: string;
  quantity: number;
  /** Index into CreateDeliveryPayload.items. */
  deliveryLineIndex: number;
}

export interface CreateDeliveryPayload {
  companyId: string;
  date: string;
  drNumber?: number; // optional — if provided, skips auto-generation; validated for duplicates
  poNo?: string;
  /** Immutable Sales Order link. The legacy TR column displays its Sales Order No. */
  salesOrderId?: string;
  salesOrderNo?: string;
  trNo?: string;
  /**
   * Which reference the user supplied: a selected Sales Order or a manually typed
   * legacy TR Number (see src/lib/deliveryReference.ts). Optional — without it the
   * previous "Sales Order number, else TR number" mapping applies.
   */
  referenceMode?: "SALES_ORDER" | "TR_NUMBER";

  srNo?: string;
  preparedBy: string;
  deliveredBy: string;
  deliveredById?: string;
  deliveredByType?: "internal" | "external";
  deliveredByOptionId?: string;
  comments?: string;
  items: DeliveryItem[];
  /** The client this delivery is for (DeliveryReceipts column Y): a company billed to `companyId`. */
  forCompanyId?: string;
  /** Contract entitlements this DR releases. One agreement per DR; never with a Sales Order. */
  contractLines?: ContractLine[];
  status?: string; // "draft" for save-without-print, "created" default
  /** Default warehouse (DeliveryReceipts column T); lines without sources take their full qty from it. Required on non-draft saves. */
  warehouseId?: string;
  /** Approval stamp (columns U–W), set by the server only. */
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
  /** Status the DR was saved for while it waits for approval (column X), set by the server only. */
  requestedStatus?: string;
}

export interface DeliveryReceiptResponse {
  success: boolean;
  drNumber: number;
  companyId?: string;
  /** The FOR client (column Y) and its resolved name, printed as "FOR: …". */
  forCompanyId?: string;
  forCompanyName?: string;
  forCompanyAddress?: string;
  forCompanyTin?: string;
  companyName: string;
  address: string;
  tin: string;
  date: string;
  poNo?: string;
  salesOrderId?: string;
  salesOrderNo?: string;
  trNo?: string;
  preparedBy: string;
  deliveredBy: string;
  deliveredById?: string;
  deliveredByType?: "internal" | "external";
  deliveredByOptionId?: string;
  comments?: string;
  items: DeliveryItem[];
  status: string;
  printUrl?: string;
  pdfBase64?: string;
  driveFileLink?: string;
  /** Legacy receipts use the prior Google Sheets template by default. */
  previewFormat?: "legacy" | "current";
  warehouseId?: string;
  /** Set when the DR saved but its contract release rows could not be written. */
  contractReleaseError?: string;
}

export interface DeliveryReceiptSummary {
  drNumber: number;
  date: string;
  companyId: string;
  companyName: string;
  poNo: string;
  salesOrderId?: string;
  salesOrderNo?: string;
  /** Legacy alias for salesOrderNo. Retained for historical records. */
  trNo: string;
  srNo?: string;
  items: DeliveryItem[];
  comments: string;
  preparedBy: string;
  deliveredBy: string;
  deliveredById?: string;
  deliveredByType?: "internal" | "external";
  deliveredByOptionId?: string;
  createdAt: string;
  status: string;
  driveFileLink?: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
  warehouseId?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
  requestedStatus?: string;
  /** The client this delivery is for (column Y). */
  forCompanyId?: string;
}

export interface DeliveryPersonOption {
  value: string;
  label: string;
  type: "internal" | "external";
  userId?: string;
  deliveryOptionId?: string;
}

export interface DRStatusEntry {
  drNumber: number;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  changedAt: string;
}

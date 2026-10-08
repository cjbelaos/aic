import type { DiscountSettings } from "../lib/discounts.ts";
export type InvoicePaymentStatus = "unpaid" | "partial" | "full";
export interface InvoiceTrackingFields {
  discountSettings?: DiscountSettings;
  discountAmount?: number;
  paymentStatus?: InvoicePaymentStatus;
  scannedFileLink?: string;
  scannedStatus?: "scanned" | "not_scanned";
  scanVerificationPending?: boolean;
  statusReason?: string;
}

export interface ServiceInvoiceItem {
  salesOrderItemId?: string;
  discountSettings?: DiscountSettings;
  discountAmount?: number;
  productId?: string;
  productCategoryId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface CreateServiceInvoicePayload {
  billingMode?: "REGULAR" | "PMS_CONTRACT";
  manualCategories?: string[];
  discountSettings?: DiscountSettings;
  /** Invoice number typed from the physical paper. Required, must be unique. */
  invoiceNo: string;
  date: string;
  /** Company ID of a Customer/Both company. */
  customerId: string;
  preparedBy: string;
  items: ServiceInvoiceItem[];
  status?: string; // "draft" for save-without-print, "created" default
  /** Contract ID that originated this SI (e.g., for PMS monthly fee). */
  contractId?: string;
  /** Linked Delivery Receipt number. */
  drNumber?: number | null;
  /** Optional direct Sales Order link for services that do not have a DR. */
  salesOrderId?: string | null;
  /** Customer PO Number. A linked Delivery Receipt is the source of truth. */
  referenceMode?: "SALES_ORDER" | "TR_NUMBER";
  poNo?: string;
  /** Sales Order Number or legacy TR Number. A linked Delivery Receipt is the source of truth. */
  trNo?: string;
  /** @deprecated Legacy name of `assignedTechnicianUserId`; still accepted. */
  deliveredById?: string;
  /** @deprecated Legacy display-name snapshot; the server resolves the name. */
  deliveredByName?: string;
  /**
   * Assigned technician (ServiceInvoices column M; the display name in column N is
   * server-resolved from the Users sheet). A linked Delivery Receipt's technician
   * always wins over the value submitted here.
   */
  assignedTechnicianUserId?: string;
}

export interface ServiceInvoiceResponse extends InvoiceTrackingFields {
  success: boolean;
  invoiceNo: string;
  date: string;
  companyName: string;
  address: string;
  tin: string;
  preparedBy: string;
  preparedByPosition?: string;
  items: ServiceInvoiceItem[];
  status: string;
  printUrl?: string;
  pdfBase64?: string;
  driveFileLink?: string;
  contractId?: string;
  drNumber?: number;
  salesOrderId?: string;
  referenceMode?: "SALES_ORDER" | "TR_NUMBER";
  poNo?: string;
  trNo?: string;
  /** @deprecated The assigned technician is `assignedTechnicianUserId` (column M). */
  deliveredById?: string;
  deliveredByName?: string;
  assignedTechnicianUserId?: string;
  assignedTechnicianName?: string;
  serviceReportId?: string;
  serviceReportStatus?: string;
  manualCompletionStatus?: "COMPLETED" | "REVERSED";
  manualCompletionDate?: string;
  manualCompletionTechnicianId?: string;
  manualCompletionTechnicianName?: string;
  manualCompletionNotes?: string;
  manualCompletionFulfillmentIds?: string[];
  trackerAssignmentOutcome?: "created" | "updated" | "unchanged" | "already_returned" | "unassigned";
  trackerAssignmentWarning?: string;
  replacesInvoiceNo?: string;
  replacementInvoiceNo?: string;
}

export interface ServiceInvoiceSummary extends InvoiceTrackingFields {
  billingMode?: "REGULAR" | "PMS_CONTRACT";
  manualCategories?: string[];
  categorySource?: "automatic" | "manual" | "uncategorized";
  /** Derived from the linked Sales Order, or PMS for a contract-only invoice. */
  category?: string;
  invoiceNo: string;
  date: string;
  customerId: string;
  companyName: string;
  preparedBy: string;
  createdAt: string;
  status: string;
  driveFileLink?: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
  items: ServiceInvoiceItem[];
  contractId?: string;
  drNumber?: number;
  salesOrderId?: string;
  referenceMode?: "SALES_ORDER" | "TR_NUMBER";
  poNo?: string;
  trNo?: string;
  /** @deprecated The assigned technician is `assignedTechnicianUserId` (column M). */
  deliveredById?: string;
  deliveredByName?: string;
  assignedTechnicianUserId?: string;
  assignedTechnicianName?: string;
  serviceReportId?: string;
  serviceReportStatus?: string;
  manualCompletionStatus?: "COMPLETED" | "REVERSED";
  manualCompletionDate?: string;
  manualCompletionTechnicianId?: string;
  manualCompletionTechnicianName?: string;
  manualCompletionNotes?: string;
  manualCompletionFulfillmentIds?: string[];
  trackerAssignmentOutcome?: "created" | "updated" | "unchanged" | "already_returned" | "unassigned";
  trackerAssignmentWarning?: string;
  replacesInvoiceNo?: string;
  replacementInvoiceNo?: string;
}

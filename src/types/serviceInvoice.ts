export interface ServiceInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface CreateServiceInvoicePayload {
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

export interface ServiceInvoiceResponse {
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
  /** @deprecated The assigned technician is `assignedTechnicianUserId` (column M). */
  deliveredById?: string;
  deliveredByName?: string;
  assignedTechnicianUserId?: string;
  assignedTechnicianName?: string;
  serviceReportId?: string;
  serviceReportStatus?: string;
  trackerAssignmentOutcome?: "created" | "updated" | "unchanged" | "already_returned" | "unassigned";
  trackerAssignmentWarning?: string;
}

export interface ServiceInvoiceSummary {
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
  /** @deprecated The assigned technician is `assignedTechnicianUserId` (column M). */
  deliveredById?: string;
  deliveredByName?: string;
  assignedTechnicianUserId?: string;
  assignedTechnicianName?: string;
  serviceReportId?: string;
  serviceReportStatus?: string;
  trackerAssignmentOutcome?: "created" | "updated" | "unchanged" | "already_returned" | "unassigned";
  trackerAssignmentWarning?: string;
}
export interface ServiceInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface CreateServiceInvoicePayload {
  /** Invoice number typed from the physical paper — required, must be unique. */
  invoiceNo: string;
  date: string;
  /** Company ID of a Customer/Both company. */
  customerId: string;
  preparedBy: string;
  items: ServiceInvoiceItem[];
  status?: string; // "draft" for save-without-print, "created" default
}

export interface ServiceInvoiceResponse {
  success: boolean;
  invoiceNo: string;
  date: string;
  companyName: string;
  address: string;
  tin: string;
  preparedBy: string;
  items: ServiceInvoiceItem[];
  status: string;
  printUrl?: string;
  pdfBase64?: string;
  driveFileLink?: string;
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
}
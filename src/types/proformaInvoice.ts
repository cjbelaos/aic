export type ProformaStatus = "DRAFT" | "ISSUED" | "CANCELLED";
export interface ProformaItem {
  salesOrderItemId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  amount: number;
}
export interface ProformaInvoice {
  id: string;
  invoiceNo: string;
  sourceInvoiceNo: string;
  status: ProformaStatus;
  salesOrderId: string;
  salesOrderNo: string;
  trNo: string;
  date: string;
  customerId: string;
  companyName: string;
  tin: string;
  address: string;
  poNo: string;
  drNo: string;
  notes: string;
  remarks: string;
  preparedBy: string;
  items: ProformaItem[];
  totalAmount: number;
  pdfLink: string;
  scanLink: string;
  version: number;
  sourceRow: number;
  importIssue: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
export interface ProformaInput {
  issue?: boolean;
  id: string;
  expectedVersion: number;
  salesOrderId: string;
  date: string;
  drNo: string;
  notes: string;
  remarks: string;
  items: Array<Pick<ProformaItem, "salesOrderItemId" | "productName" | "unit" | "quantity" | "unitPrice">>;
}

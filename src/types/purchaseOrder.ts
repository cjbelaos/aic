// purchaseOrder.ts

export interface PurchaseOrderItem {
  purchaseOrderId?: string;
  itemNo: number;
  productCode?: string;
  productId?: string;
  supplierProductId?: string;
  description: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalAmount: number;
}

export interface CreatePurchaseOrderPayload {
  supplierId: string;
  date: string;
  /** Used only when finalizing; the server assigns automatic numbers. */
  poNumberMode?: "automatic" | "manual";
  poNumber?: string; // Optional — string format e.g. "AIC-VTALTE-797"
  prNumber?: string;
  preparedBy: string;
  approvedBy?: string;
  notedBy?: string;
  comments?: string;
  items: PurchaseOrderItem[];
  status?: string;
  deliveryDate?: string;
  paymentTerms?: string;
}

export interface PurchaseOrderResponse {
  success: boolean;
  poNumber: string;
  supplierName: string;
  address: string;
  tin: string;
  date: string;
  prNumber?: string;
  preparedBy: string;
  approvedBy?: string;
  notedBy?: string;
  comments?: string;
  items: PurchaseOrderItem[];
  status: string;
  printUrl?: string;
  pdfBase64?: string;
  driveFileLink?: string;
  totalAmount: number;
}

export interface PurchaseOrderSummary {
  poNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  prNumber?: string;
  deliveryDate?: string;
  paymentTerms?: string;
  items: PurchaseOrderItem[];
  comments?: string;
  preparedBy: string;
  approvedBy?: string;
  notedBy?: string;
  status: string;
  totalAmount: number;
  driveFileLink?: string;
  createdAt: string;
  createdBy?: string;
  updatedBy?: string;
  updatedDate?: string;
}

export interface POStatusEntry {
  poNumber: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  changedAt: string;
}

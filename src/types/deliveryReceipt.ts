export interface DeliveryItem {
  productCode: string;
  unit: string;
  description: string;
  quantity: number;
}

export interface CreateDeliveryPayload {
  companyId: string;
  date: string;
  poNo?: string;
  trNo?: string;
  preparedBy: string;
  deliveredBy: string;
  comments?: string;
  items: DeliveryItem[];
}

export interface DeliveryReceiptResponse {
  success: boolean;
  drNumber: number;
  companyName: string;
  address: string;
  tin: string;
  date: string;
  poNo?: string;
  trNo?: string;
  preparedBy: string;
  deliveredBy: string;
  comments?: string;
  items: DeliveryItem[];
  status: string;
  printUrl?: string;
  pdfBase64?: string;
  driveFileLink?: string;
}

export interface DeliveryReceiptSummary {
  drNumber: number;
  date: string;
  companyId: string;
  companyName: string;
  poNo: string;
  trNo: string;
  items: DeliveryItem[];
  comments: string;
  preparedBy: string;
  deliveredBy: string;
  createdAt: string;
  status: string;
  driveFileLink?: string;
}

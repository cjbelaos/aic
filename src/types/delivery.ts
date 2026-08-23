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
  printUrl?: string;
  pdfBase64?: string;
}

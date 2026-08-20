export interface DeliveryItem {
  productCode: string;
  unit: string;
  description: string;
  quantity: number;
}

export interface CreateDeliveryPayload {
  companyName: string;
  date: string;
  poNo?: string;
  trNo?: string;
  deliveredBy: string;
  comments?: string;
  items: DeliveryItem[];
}

export interface DeliveryReceiptResponse {
  drNumber: number;
  printUrl?: string;
  success: boolean;
}

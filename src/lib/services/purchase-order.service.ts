import api from "@/lib/apiClient";
import {
  CreatePurchaseOrderPayload,
  PurchaseOrderSummary,
  PurchaseOrderResponse,
} from "@/types/purchaseOrder";

// apiClient already uses `/api` as its base URL. Supplying `/api` here made
// requests resolve to `/api/api/purchase-orders` and caused a 404 on the PO list.
const BASE_PATH = "/purchase-orders";

const purchaseOrderService = {
  getAll: (): Promise<PurchaseOrderSummary[]> => {
    return api.get<PurchaseOrderSummary[]>(BASE_PATH);
  },

  getOne: (poNumber: string): Promise<PurchaseOrderResponse> => {
    return api.get<PurchaseOrderResponse>(`${BASE_PATH}/${poNumber}`);
  },

  create: (
    payload: CreatePurchaseOrderPayload,
  ): Promise<PurchaseOrderResponse> => {
    return api.post<PurchaseOrderResponse>(BASE_PATH, payload);
  },

  update: (
    poNumber: string,
    payload: Partial<CreatePurchaseOrderPayload>,
  ): Promise<PurchaseOrderResponse> => {
    return api.put<PurchaseOrderResponse>(`${BASE_PATH}/${poNumber}`, payload);
  },

  delete: (poNumber: string): Promise<{ success: boolean }> => {
    return api.delete<{ success: boolean }>(`${BASE_PATH}/${poNumber}`);
  },

  getPreview: (poNumber: string): Promise<PurchaseOrderResponse> => {
    return api.get<PurchaseOrderResponse>(`${BASE_PATH}/${poNumber}`);
  },

  savePdfToDrive: (payload: {
    poNumber: string;
    supplierName: string;
    date: string;
    pdfBase64: string;
  }): Promise<{
    success: boolean;
    fileId: string;
    fileLink: string;
    fileName: string;
    message: string;
  }> => {
    return api.post(`${BASE_PATH}/save-pdf`, payload);
  },
};

export default purchaseOrderService;

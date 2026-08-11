import axios from "axios";
import type {
  LiquidationFull,
  ReceiptItemInput,
} from "@/types/liquidation";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export interface CreateLiquidationResponse {
  success: boolean;
  liquidationId: string;
  totalAmount: number;
  itemCount: number;
}

export interface UploadReceiptResponse {
  success: boolean;
  receiptImageUrl: string;
  proxyUrl: string;
  fileName: string;
}

export const liquidationService = {
  /**
   * Creates a new liquidation batch. UserId is captured server-side.
   */
  async create(items: ReceiptItemInput[]): Promise<CreateLiquidationResponse> {
    const res = await api.post<CreateLiquidationResponse>("/liquidations", {
      items,
    });
    return res.data;
  },

  /**
   * Lists the current user's liquidations with their receipt items.
   */
  async getMyLiquidations(): Promise<LiquidationFull[]> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFull[];
    }>("/liquidations");
    return res.data.liquidations;
  },

  /**
   * Uploads a single receipt file (image/PDF) and returns its public URL.
   */
  async uploadReceipt(file: File): Promise<UploadReceiptResponse> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post<UploadReceiptResponse>(
      "/liquidations/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return res.data;
  },
};
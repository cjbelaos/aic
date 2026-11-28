import axios from "axios";
import type { SerialUpdate } from "@/lib/deliverySerials";
import { toast } from "sonner";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
  DeliveryReceiptSummary,
  DeliveryPersonOption,
} from "@/types/deliveryReceipt";
import { UpdateDeliveryPayload } from "@/lib/deliverySheets";

const API_BASE_URL = "/api/deliveries";

const deliveryService = {
  getAll: async (): Promise<DeliveryReceiptSummary[]> => {
    try {
      const response = await axios.get<DeliveryReceiptSummary[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch delivery receipts in service layer:",
        error,
      );
      return [];
    }
  },

  getDrivers: async (): Promise<DeliveryPersonOption[]> => {
    try {
      const response = await axios.get<DeliveryPersonOption[]>(`${API_BASE_URL}/drivers`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch drivers in service layer:", error);
      return [];
    }
  },

  createAndPopulateSheet: async (
    payload: CreateDeliveryPayload,
  ): Promise<DeliveryReceiptResponse> => {
    try {
      // The request ID lets the PostgreSQL backend replay a repeated save instead of creating a
      // second DR. Never resend automatically: the Sheets backend ignores the ID, so a resend
      // after a lost response would create a duplicate there.
      const requestId = crypto.randomUUID();
      const response = await axios.post<DeliveryReceiptResponse>(API_BASE_URL, { ...payload, requestId, pdfFormat: "html" });
      if (payload.status !== "draft") {
        try {
          const { generateDeliveryReceiptPdfBase64 } = await import("@/lib/deliveryReceiptPdf");
          const pdfBase64 = await generateDeliveryReceiptPdfBase64(response.data);
          const saved = await deliveryService.savePdfToDrive(response.data.drNumber, response.data.companyName, response.data.date, pdfBase64);
          response.data.driveFileLink = saved.fileLink;
        } catch {
          toast.warning("Receipt created, but its PDF was not saved to Drive. Reopen the preview and use Save to Drive to retry.");
        }
      }
      return response.data;
    } catch (error) {
      console.error(
        "Failed to create delivery receipt in service layer:",
        error,
      );
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error;
        if (typeof message === "string" && message.trim()) throw new Error(message);
      }
      throw error;
    }
  },

  update: async (
    drNumber: number,
    payload: UpdateDeliveryPayload,
  ): Promise<DeliveryReceiptSummary> => {
    try {
      // Request ID for PostgreSQL replay; no automatic resend (see createAndPopulateSheet).
      const requestId = crypto.randomUUID();
      const response = await axios.put<DeliveryReceiptSummary>(`${API_BASE_URL}/${drNumber}`, { ...payload, requestId });
      return response.data;
    } catch (error) {
      console.error("Failed to update delivery receipt:", error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error;
        if (typeof message === "string" && message.trim()) throw new Error(message);
      }
      throw error;
    }
  },

  getPreview: async (
    drNumber: number,
  ): Promise<DeliveryReceiptResponse> => {
    try {
      const response = await axios.get<DeliveryReceiptResponse>(
        `${API_BASE_URL}/${drNumber}`,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to fetch DR preview:", error);
      throw error;
    }
  },

  delete: async (drNumber: number): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${drNumber}`);
    } catch (error) {
      console.error("Failed to delete delivery receipt:", error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error;
        if (typeof message === "string" && message.trim()) throw new Error(message);
      }
      throw error;
    }
  },

  updateSerials: async (drNumber: number, updates: SerialUpdate[]): Promise<void> => {
    try {
      await axios.patch(`${API_BASE_URL}/${drNumber}/serials`, { items: updates });
    } catch (error) {
      console.error("Failed to update delivery receipt serials:", error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error;
        if (typeof message === "string" && message.trim()) throw new Error(message);
      }
      throw error;
    }
  },

  savePdfToDrive: async (
    drNumber: number,
    companyName: string,
    deliveryDate: string,
    pdfBase64?: string,
  ): Promise<{ fileLink: string; fileName: string }> => {
    try {
      if (!pdfBase64) {
        const dr = await deliveryService.getPreview(drNumber);
        const { generateDeliveryReceiptPdfBase64 } = await import("@/lib/deliveryReceiptPdf");
        pdfBase64 = await generateDeliveryReceiptPdfBase64(dr);
      }
      const response = await axios.post(`${API_BASE_URL}/save-pdf`, {
        drNumber,
        companyName,
        deliveryDate,
        pdfBase64,
      });
      return response.data;
    } catch (error) {
      console.error("Failed to save DR PDF to Drive:", error);
      throw error;
    }
  },

  /**
   * Uploads a signed, scanned DR. The server files it in Drive, completes an
   * issued DR and returns its Document Tracker entry.
   */
  uploadScanned: async (
    drNumber: string,
    file: File,
  ): Promise<{ fileLink: string; fileName: string; trackerWarning?: string; statusWarning?: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("drNumber", drNumber);
    const response = await axios.post(`${API_BASE_URL}/upload-scanned`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
};

export default deliveryService;

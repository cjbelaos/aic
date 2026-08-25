import axios from "axios";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
  DeliveryReceiptSummary,
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

  getDrivers: async (): Promise<string[]> => {
    try {
      const response = await axios.get<string[]>(`${API_BASE_URL}/drivers`);
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
      const response = await axios.post<DeliveryReceiptResponse>(
        API_BASE_URL,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        "Failed to create delivery receipt in service layer:",
        error,
      );
      throw error;
    }
  },

  update: async (
    drNumber: number,
    payload: UpdateDeliveryPayload,
  ): Promise<DeliveryReceiptSummary> => {
    try {
      const response = await axios.put<DeliveryReceiptSummary>(
        `${API_BASE_URL}/${drNumber}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to update delivery receipt:", error);
      throw error;
    }
  },

  delete: async (drNumber: number): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${drNumber}`);
    } catch (error) {
      console.error("Failed to delete delivery receipt:", error);
      throw error;
    }
  },

  savePdfToDrive: async (
    drNumber: number,
    companyName: string,
    deliveryDate: string,
  ): Promise<{ fileLink: string; fileName: string }> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/save-pdf`, {
        drNumber,
        companyName,
        deliveryDate,
      });
      return response.data;
    } catch (error) {
      console.error("Failed to save DR PDF to Drive:", error);
      throw error;
    }
  },
};

export default deliveryService;

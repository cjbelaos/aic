import axios from "axios";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
} from "@/types/delivery";

const API_BASE_URL = "/api/deliveries";

const deliveryService = {
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

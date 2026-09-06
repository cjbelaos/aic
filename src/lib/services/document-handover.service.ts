import axios from "axios";
import {
  DocumentHandover,
  DocumentOption,
  CreateDocumentHandoverInput,
} from "@/types/documentHandover";

const API_BASE_URL = "/api/document-handovers";

const documentHandoverService = {
  getAll: async (): Promise<DocumentHandover[]> => {
    try {
      const response = await axios.get<DocumentHandover[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch document handovers:", error);
      return [];
    }
  },

  batchCreate: async (
    handovers: CreateDocumentHandoverInput[],
  ): Promise<DocumentHandover[]> => {
    try {
      const response = await axios.post<DocumentHandover[]>(
        `${API_BASE_URL}/batch`,
        { handovers },
      );
      return response.data;
    } catch (error) {
      console.error("Failed to batch create handovers:", error);
      throw error;
    }
  },

  batchReturn: async (ids: string[], notes?: string): Promise<void> => {
    try {
      await axios.put(`${API_BASE_URL}/batch/return`, { ids, notes });
    } catch (error) {
      console.error("Failed to batch return handovers:", error);
      throw error;
    }
  },

  getStats: async (): Promise<{
    total: number;
    handedOver: number;
    returned: number;
  }> => {
    try {
      const response = await axios.get<{
        total: number;
        handedOver: number;
        returned: number;
      }>(`${API_BASE_URL}`, {
        params: { filter: "stats" },
      });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch handover stats:", error);
      return { total: 0, handedOver: 0, returned: 0 };
    }
  },
};

export default documentHandoverService;

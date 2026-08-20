import axios from "axios";
import {
  ContractItem,
  CreateContractItemPayload,
  UpdateContractItemPayload,
} from "@/types/contract";

const API_BASE_URL = "/api/contract-items";

const contractItemService = {
  /**
   * Fetches all contract line items
   */
  getAll: async (): Promise<ContractItem[]> => {
    try {
      const response = await axios.get<ContractItem[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch contract items:", error);
      return [];
    }
  },

  /**
   * Fetches all contract line items, optionally filtered by contractId
   */
  getByContractId: async (contractId?: string): Promise<ContractItem[]> => {
    try {
      const url = contractId
        ? `${API_BASE_URL}?contractId=${encodeURIComponent(contractId)}`
        : API_BASE_URL;
      const response = await axios.get<ContractItem[]>(url);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        `Failed to fetch contract items for contractId "${contractId}" in service layer:`,
        error,
      );
      return [];
    }
  },

  /**
   * Creates a new contract line item row
   */
  create: async (
    payload: CreateContractItemPayload,
  ): Promise<ContractItem | null> => {
    try {
      const response = await axios.post<ContractItem>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create contract item in service layer:", error);
      throw error;
    }
  },

  /**
   * Updates an existing contract line item row by ID
   */
  update: async (
    payload: UpdateContractItemPayload,
  ): Promise<ContractItem | null> => {
    try {
      const response = await axios.put<ContractItem>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update contract item with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Clears a contract line item row from the Google Sheet by ID
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete contract item with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default contractItemService;

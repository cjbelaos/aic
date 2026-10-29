import axios from "axios";
import {
  Contract,
  CreateContractPayload,
  UpdateContractPayload,
  ContractNote,
} from "@/types/contract";

const API_BASE_URL = "/api/contracts";

const contractService = {
  /**
   * Fetches all contract headers from the Google Sheet
   */
  getAll: async (): Promise<Contract[]> => {
    try {
      const response = await axios.get<Contract[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch contracts in service layer:", error);
      throw error;
    }
  },

  /**
   * Fetches contracts filtered by company ID
   */
  getByCompanyId: async (companyId: string): Promise<Contract[]> => {
    try {
      const response = await axios.get<Contract[]>(
        `${API_BASE_URL}?companyId=${encodeURIComponent(companyId)}`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        `Failed to fetch contracts for companyId "${companyId}" in service layer:`,
        error,
      );
      return [];
    }
  },

  /**
   * Fetches contract entitlements for a customer (alias for getByCompanyId)
   */
  getEntitlementsByCustomer: async (companyId: string): Promise<Contract[]> => {
    return contractService.getByCompanyId(companyId);
  },

  /**
   * Fetches a single contract by ID
   */
  getById: async (id: string): Promise<Contract | null> => {
    try {
      const response = await axios.get<Contract>(`${API_BASE_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error(
        `Failed to fetch contract with ID ${id} in service layer:`,
        error,
      );
      return null;
    }
  },

  /**
   * Appends a new contract header row to the Google Sheet
   */
  create: async (payload: CreateContractPayload): Promise<Contract | null> => {
    try {
      const response = await axios.post<Contract>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create contract in service layer:", error);
      throw error;
    }
  },

  /**
   * Updates an existing contract header row by ID
   */
  update: async (payload: UpdateContractPayload): Promise<Contract | null> => {
    try {
      const response = await axios.put<Contract>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update contract with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  addNote: async (contractId: string, text: string): Promise<ContractNote> => {
    const response = await axios.post<ContractNote>(`${API_BASE_URL}/${encodeURIComponent(contractId)}/notes`, { text });
    return response.data;
  },

  updateNote: async (contractId: string, noteId: string, text: string): Promise<ContractNote> => {
    const response = await axios.put<ContractNote>(`${API_BASE_URL}/${encodeURIComponent(contractId)}/notes/${encodeURIComponent(noteId)}`, { text });
    return response.data;
  },

  deleteNote: async (contractId: string, noteId: string): Promise<void> => {
    await axios.delete(`${API_BASE_URL}/${encodeURIComponent(contractId)}/notes/${encodeURIComponent(noteId)}`);
  },

  /**
   * Removes or clears a contract row from the Google Sheet by ID
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete contract with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default contractService;

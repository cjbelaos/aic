import axios from "axios";
import {
  Company,
  CreateCompanyPayload,
  UpdateCompanyPayload,
} from "@/types/company";

const API_BASE_URL = "/api/companies";

const companyService = {
  getAll: async (): Promise<Company[]> => {
    try {
      const response = await axios.get<Company[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch companies in service layer:", error);
      return [];
    }
  },

  create: async (payload: CreateCompanyPayload): Promise<Company | null> => {
    try {
      const response = await axios.post<Company>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create company in service layer:", error);
      throw error;
    }
  },

  update: async (payload: UpdateCompanyPayload): Promise<Company | null> => {
    try {
      const response = await axios.put<Company>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update company with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete company with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default companyService;

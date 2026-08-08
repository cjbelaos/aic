import axios from "axios";
import {
  CompanyContact,
  CreateCompanyContactPayload,
  UpdateCompanyContactPayload,
} from "@/types/companyContact";

const API_BASE_URL = "/api/company-contacts";

const companyContactService = {
  getAll: async (): Promise<CompanyContact[]> => {
    try {
      const response = await axios.get<CompanyContact[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch company contacts in service layer:",
        error,
      );
      return [];
    }
  },

  create: async (
    payload: CreateCompanyContactPayload,
  ): Promise<CompanyContact | null> => {
    try {
      const response = await axios.post<CompanyContact>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error(
        "Failed to create company contact in service layer:",
        error,
      );
      throw error;
    }
  },

  update: async (
    payload: UpdateCompanyContactPayload,
  ): Promise<CompanyContact | null> => {
    try {
      const response = await axios.put<CompanyContact>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update company contact with ID ${payload.id} in service layer:`,
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
        `Failed to delete company contact with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default companyContactService;

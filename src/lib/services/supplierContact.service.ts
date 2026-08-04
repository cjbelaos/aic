import axios from "axios";
import {
  SupplierContact,
  CreateSupplierContactPayload,
  UpdateSupplierContactPayload,
} from "@/types/supplierContact";

const API_BASE_URL = "/api/supplier-contacts";

const supplierContactService = {
  getAll: async (): Promise<SupplierContact[]> => {
    try {
      const response = await axios.get<SupplierContact[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch supplier contacts in service layer:",
        error,
      );
      return [];
    }
  },

  create: async (
    payload: CreateSupplierContactPayload,
  ): Promise<SupplierContact | null> => {
    try {
      const response = await axios.post<SupplierContact>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error(
        "Failed to create supplier contact in service layer:",
        error,
      );
      throw error;
    }
  },

  update: async (
    payload: UpdateSupplierContactPayload,
  ): Promise<SupplierContact | null> => {
    try {
      const response = await axios.put<SupplierContact>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update supplier contact with ID ${payload.id} in service layer:`,
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
        `Failed to delete supplier contact with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default supplierContactService;

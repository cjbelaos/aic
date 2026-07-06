import axios from "axios";
import {
  Supplier,
  CreateSupplierPayload,
  UpdateSupplierPayload,
} from "@/types/supplier";

const API_BASE_URL = "/api/suppliers";

const supplierService = {
  getAll: async (): Promise<Supplier[]> => {
    try {
      const response = await axios.get<Supplier[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch suppliers in service layer:", error);
      return [];
    }
  },

  create: async (payload: CreateSupplierPayload): Promise<Supplier | null> => {
    try {
      const response = await axios.post<Supplier>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create supplier in service layer:", error);
      throw error;
    }
  },

  update: async (payload: UpdateSupplierPayload): Promise<Supplier | null> => {
    try {
      const response = await axios.put<Supplier>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update supplier with ID ${payload.id} in service layer:`,
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
        `Failed to delete supplier with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default supplierService;

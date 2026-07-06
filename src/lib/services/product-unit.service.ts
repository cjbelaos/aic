import axios from "axios";
import {
  ProductUnit,
  CreateProductUnitPayload,
  UpdateProductUnitPayload,
} from "@/types/product-unit";

const API_BASE_URL = "/api/product-units"; // Adjust to match your project route directory structure

const productUnitService = {
  /**
   * Fetches all rows mapped to ProductUnit items from the Google Sheet
   */
  getAll: async (): Promise<ProductUnit[]> => {
    try {
      const response = await axios.get<ProductUnit[]>(API_BASE_URL);
      // Ensure the incoming data is safely an array
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch products in service layer:", error);
      // Return a safe fallback array so component .map() functions don't white-screen crash
      return [];
    }
  },

  /**
   * Appends a new product unit row to the Google Sheet
   */
  create: async (
    payload: CreateProductUnitPayload,
  ): Promise<ProductUnit | null> => {
    try {
      const response = await axios.post<ProductUnit>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create product unit in service layer:", error);
      throw error;
    }
  },

  /**
   * Updates an existing product unit row in the Google Sheet using their ID
   */
  update: async (
    payload: UpdateProductUnitPayload,
  ): Promise<ProductUnit | null> => {
    try {
      // Sends a PUT request with the user's updated fields bundle
      const response = await axios.put<ProductUnit>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update product unit with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Removes or clears a product unit row from the Google Sheet by ID
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete product unit with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default productUnitService;

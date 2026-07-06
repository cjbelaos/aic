import axios from "axios";
import {
  Product,
  CreateProductPayload,
  UpdateProductPayload,
} from "@/types/product";

const API_BASE_URL = "/api/products";

const productService = {
  /**
   * Fetches all rows mapped to Product items from the Google Sheet
   */
  getAll: async (): Promise<Product[]> => {
    try {
      const response = await axios.get<Product[]>(API_BASE_URL);

      // Ensure the incoming data is safely an array
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch products in service layer:", error);
      // Return a safe fallback array so component .map() functions don't white-screen crash
      return [];
    }
  },

  /**
   * Appends a new product row to the Google Sheet
   */
  create: async (payload: CreateProductPayload): Promise<Product | null> => {
    try {
      const response = await axios.post<Product>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create product in service layer:", error);
      throw error;
    }
  },

  /**
   * Updates an existing product row in the Google Sheet using their ID
   */
  update: async (payload: UpdateProductPayload): Promise<Product | null> => {
    try {
      // Sends a PUT request with the user's updated fields bundle
      const response = await axios.put<Product>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update product with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Removes or clears a product row from the Google Sheet by ID
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete product with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default productService;

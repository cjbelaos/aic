import axios from "axios";
import {
  ProductUnit,
  CreateProductUnitPayload,
  UpdateProductUnitPayload,
} from "@/types/product-unit";
import type { ProductUnitRecord } from "@/types/product-reference";

const API_BASE_URL = "/api/product-units";
const toView = (item: ProductUnitRecord): ProductUnit => ({ id: item.unitId, code: item.unitCode, name: item.unitName });

const productUnitService = {
  /**
   * Fetches all rows mapped to ProductUnit items from the Google Sheet
   */
  getAll: async (): Promise<ProductUnit[]> => {
    try {
      const response = await axios.get<ProductUnitRecord[]>(API_BASE_URL);
      // Ensure the incoming data is safely an array
      return Array.isArray(response.data) ? response.data.map(toView) : [];
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
      const response = await axios.post<ProductUnitRecord>(API_BASE_URL, { unitCode: payload.code, unitName: payload.name, status: "active" });
      return toView(response.data);
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
      const response = await axios.put<ProductUnitRecord>(
        `${API_BASE_URL}/${payload.id}`,
        { unitCode: payload.code, unitName: payload.name },
      );
      return toView(response.data);
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

  /**
   * Clears all product unit rows from the Google Sheet
   */
  clearAll: async (): Promise<void> => {
    throw new Error("Bulk clearing is disabled for ProductUnits.");
  },
};

export default productUnitService;
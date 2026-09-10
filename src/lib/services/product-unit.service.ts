import axios from "axios";
import {
  ProductUnit,
  CreateProductUnitPayload,
  UpdateProductUnitPayload,
} from "@/types/product-unit";
import type { ProductUnitV2 } from "@/types/product-reference-v2";

const API_BASE_URL = "/api/v2/product-units";
const fromV2 = (item: ProductUnitV2): ProductUnit => ({ id: item.unitId, code: item.unitCode, name: item.unitName });

const productUnitService = {
  /**
   * Fetches all rows mapped to ProductUnit items from the Google Sheet
   */
  getAll: async (): Promise<ProductUnit[]> => {
    try {
      const response = await axios.get<ProductUnitV2[]>(API_BASE_URL);
      // Ensure the incoming data is safely an array
      return Array.isArray(response.data) ? response.data.map(fromV2) : [];
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
      const response = await axios.post<ProductUnitV2>(API_BASE_URL, { unitCode: payload.code, unitName: payload.name, status: "active" });
      return fromV2(response.data);
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
      const response = await axios.put<ProductUnitV2>(
        `${API_BASE_URL}/${payload.id}`,
        { unitCode: payload.code, unitName: payload.name },
      );
      return fromV2(response.data);
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
    throw new Error("Bulk clearing is disabled for ProductUnitsV2.");
  },
};

export default productUnitService;

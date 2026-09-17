import axios from "axios";
import {
  ProductCategory,
  CreateProductCategoryPayload,
  UpdateProductCategoryPayload,
} from "@/types/product-category";
import type { ProductCategoryRecord } from "@/types/product-reference";

const API_BASE_URL = "/api/product-categories";
const toView = (item: ProductCategoryRecord): ProductCategory => ({ id: item.productCategoryId, code: item.categoryCode, name: item.categoryName });

const productCategoryService = {
  /**
   * Fetches all rows mapped to ProductCategory items from the Google Sheet.
   */
  getAll: async (): Promise<ProductCategory[]> => {
    try {
      const response = await axios.get<ProductCategoryRecord[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data.map(toView) : [];
    } catch (error) {
      console.error(
        "Failed to fetch product categories in service layer:",
        error,
      );
      return [];
    }
  },

  /**
   * Appends a new product category row to the Google Sheet.
   */
  create: async (
    payload: CreateProductCategoryPayload,
  ): Promise<ProductCategory | null> => {
    try {
      const response = await axios.post<ProductCategoryRecord>(API_BASE_URL, { categoryCode: payload.code, categoryName: payload.name, status: "active" });
      return toView(response.data);
    } catch (error) {
      console.error(
        "Failed to create product category in service layer:",
        error,
      );
      throw error;
    }
  },

  /**
   * Updates an existing product category row in the Google Sheet using its ID.
   */
  update: async (
    payload: UpdateProductCategoryPayload,
  ): Promise<ProductCategory | null> => {
    try {
      const response = await axios.put<ProductCategoryRecord>(
        `${API_BASE_URL}/${payload.id}`,
        { categoryCode: payload.code, categoryName: payload.name },
      );
      return toView(response.data);
    } catch (error) {
      console.error(
        `Failed to update product category with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Removes or clears a product category row from the Google Sheet by ID.
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete product category with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Clears all product category rows from the Google Sheet.
   */
  clearAll: async (): Promise<void> => {
    throw new Error("Bulk clearing is disabled for ProductCategories.");
  },
};

export default productCategoryService;
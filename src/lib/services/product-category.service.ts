import axios from "axios";
import { ApiResponse } from "./auth.service";
import {
  ProductCategory,
  CreateProductCategoryPayload,
  UpdateProductCategoryPayload,
} from "@/types/product-category";

const API_BASE_URL = "/api/product-categories";

const productCategoryService = {
  /**
   * Fetches all rows mapped to ProductCategory items from the Google Sheet.
   */
  getAll: async (): Promise<ProductCategory[]> => {
    try {
      const response = await axios.get<ProductCategory[]>(API_BASE_URL);

      // The API returns the array directly; handle both wrapped and direct responses
      const data = response.data as any;
      if (data?.isSuccess !== undefined) {
        // ApiResponse wrapper format
        if (!data.isSuccess || !data.result) {
          throw new Error(
            data.errorMessages?.[0] || "Failed to load product categories",
          );
        }
        return data.result;
      }

      // Direct array format
      return Array.isArray(data) ? data : [];
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
      const response = await axios.post<ProductCategory>(API_BASE_URL, payload);
      return response.data;
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
      const response = await axios.put<ProductCategory>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
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
};

export default productCategoryService;

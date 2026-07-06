import axios from "axios";
import { ApiResponse } from "./auth.service";
import { ProductCategory } from "@/types/product-category";

const API_BASE_URL = "/api/product-categories"; // Adjust to match your project route directory structure

const productCategoryService = {
  /**
   * Fetches all rows mapped to ProductCategory items from the Google Sheet
   */
  getAll: async (): Promise<ProductCategory[]> => {
    const response =
      await axios.get<ApiResponse<ProductCategory[]>>(API_BASE_URL);
    if (!response.data.isSuccess || !response.data.result) {
      throw new Error(
        response.data.errorMessages?.[0] || "Failed to load product categories",
      );
    }
    return response.data.result;
  },
};

export default productCategoryService;

import axios from "axios";
import {
  Product,
  CreateProductPayload,
  UpdateProductPayload,
} from "@/types/product";
import type { ProductV2 } from "@/types/product-v2";
import type { SupplierProductV2 } from "@/types/supplier-product";
import type { ProductCategoryV2, ProductUnitV2 } from "@/types/product-reference-v2";

const API_BASE_URL = "/api/v2/products";

const emptySupplier: Product["supplier"] = {
  id: "", row: 0, companyId: "", companyType: "Supplier", companyName: "",
  tin: "", address: "", latitude: undefined, longitude: undefined, status: "active",
};

function fromV2(product: ProductV2, supplierCount = 0, categories: ProductCategoryV2[] = [], units: ProductUnitV2[] = []): Product {
  const category = categories.find((item) => item.productCategoryId === product.productCategoryId);
  const unit = units.find((item) => item.unitId === product.unitId);
  return {
    id: product.productId,
    productId: product.productId,
    code: product.productCode,
    name: product.productName,
    category: { id: product.productCategoryId, code: category?.categoryCode ?? product.productCategoryId, name: category?.categoryName ?? product.productCategoryId },
    description: "",
    unit: { id: product.unitId, code: unit?.unitCode ?? product.unitId, name: unit?.unitName ?? product.unitId },
    costPerUnit: 0,
    pricePerUnit: product.defaultSellingPrice ?? 0,
    defaultSellingPrice: product.defaultSellingPrice,
    supplier: emptySupplier,
    sourceVersion: product.sourceVersion,
    supplierCount,
  };
}

const productService = {
  /**
   * Fetches all rows mapped to Product items from the Google Sheet
   */
  getAll: async (): Promise<Product[]> => {
    try {
      const [response, offerings, references] = await Promise.all([
        axios.get<ProductV2[]>(API_BASE_URL),
        axios.get<SupplierProductV2[]>("/api/v2/supplier-products", { params: { status: "active" } })
          .catch(() => ({ data: [] as SupplierProductV2[] })),
        axios.get<{ categories: ProductCategoryV2[]; units: ProductUnitV2[] }>("/api/v2/product-references")
          .catch(() => ({ data: { categories: [], units: [] } })),
      ]);

      // Ensure the incoming data is safely an array
      const counts = offerings.data.reduce((map, offering) => map.set(offering.productId, (map.get(offering.productId) ?? 0) + 1), new Map<string, number>());
      return Array.isArray(response.data) ? response.data.map((product) => fromV2(product, counts.get(product.productId) ?? 0, references.data.categories, references.data.units)) : [];
    } catch (error) {
      console.error("Failed to fetch products in service layer:", error);
      // Return a safe fallback array so component .map() functions don't white-screen crash
      return [];
    }
  },

  /**
   * Helper method to look up the full Product object by code from a list of products
   */
  getProductByCode: (
    code: string,
    products: Product[],
  ): Product | undefined => {
    return products.find((p) => p.code === code);
  },

  /**
   * Appends a new product row to the Google Sheet
   */
  create: async (payload: CreateProductPayload): Promise<Product | null> => {
    try {
      const references = await axios.get<{ categories: ProductCategoryV2[]; units: ProductUnitV2[] }>("/api/v2/product-references");
      const category = references.data.categories.find((item) => item.categoryCode === (payload.category.code || payload.category.name));
      const unit = references.data.units.find((item) => item.unitCode === (payload.unit.code || payload.unit.name));
      if (!category || !unit) throw new Error("The selected category or unit is not available in V2.");
      const response = await axios.post<ProductV2>(API_BASE_URL, {
        productCode: payload.code,
        productName: payload.name,
        productCategoryId: category.productCategoryId,
        unitId: unit.unitId,
        defaultSellingPrice: payload.pricePerUnit,
        status: "active",
      });
      return fromV2(response.data, 0, references.data.categories, references.data.units);
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
      const references = await axios.get<{ categories: ProductCategoryV2[]; units: ProductUnitV2[] }>("/api/v2/product-references");
      const category = references.data.categories.find((item) => item.categoryCode === (payload.category?.code || payload.category?.name));
      const unit = references.data.units.find((item) => item.unitCode === (payload.unit?.code || payload.unit?.name));
      const response = await axios.put<ProductV2>(
        `${API_BASE_URL}/${payload.id}`,
        {
          productCode: payload.code,
          productName: payload.name,
          productCategoryId: category?.productCategoryId,
          unitId: unit?.unitId,
          defaultSellingPrice: payload.pricePerUnit,
        },
      );
      return fromV2(response.data, 0, references.data.categories, references.data.units);
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

  /**
   * Clears all product rows from the Google Sheet
   */
  clearAll: async (): Promise<void> => {
    throw new Error("Bulk clearing is disabled for ProductsV2. Import must be non-destructive.");
  },
};

export default productService;

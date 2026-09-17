import axios from "axios";
import {
  Product,
  CreateProductPayload,
  UpdateProductPayload,
} from "@/types/product";
import type { ProductRecord } from "@/types/product-record";
import type { SupplierProduct } from "@/types/supplier-product";
import type { ProductCategoryRecord, ProductUnitRecord } from "@/types/product-reference";

const API_BASE_URL = "/api/products";

const emptySupplier: Product["supplier"] = {
  id: "", row: 0, companyId: "", companyType: "Supplier", companyName: "",
  tin: "", address: "", latitude: undefined, longitude: undefined, status: "active",
};

function toView(product: ProductRecord, supplierCount = 0, categories: ProductCategoryRecord[] = [], units: ProductUnitRecord[] = []): Product {
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
        axios.get<ProductRecord[]>(API_BASE_URL),
        axios.get<SupplierProduct[]>("/api/supplier-products", { params: { status: "active" } })
          .catch(() => ({ data: [] as SupplierProduct[] })),
        axios.get<{ categories: ProductCategoryRecord[]; units: ProductUnitRecord[] }>("/api/product-references")
          .catch(() => ({ data: { categories: [], units: [] } })),
      ]);

      // Ensure the incoming data is safely an array
      const counts = offerings.data.reduce((map, offering) => map.set(offering.productId, (map.get(offering.productId) ?? 0) + 1), new Map<string, number>());
      return Array.isArray(response.data) ? response.data.map((product) => toView(product, counts.get(product.productId) ?? 0, references.data.categories, references.data.units)) : [];
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
      const references = await axios.get<{ categories: ProductCategoryRecord[]; units: ProductUnitRecord[] }>("/api/product-references");
      const category = references.data.categories.find((item) => item.categoryCode === (payload.category.code || payload.category.name));
      const unit = references.data.units.find((item) => item.unitCode === (payload.unit.code || payload.unit.name));
      if (!category || !unit) throw new Error("The selected category or unit is not available.");
      const response = await axios.post<ProductRecord>(API_BASE_URL, {
        productCode: payload.code,
        productName: payload.name,
        productCategoryId: category.productCategoryId,
        unitId: unit.unitId,
        defaultSellingPrice: payload.pricePerUnit,
        status: "active",
      });
      return toView(response.data, 0, references.data.categories, references.data.units);
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
      const references = await axios.get<{ categories: ProductCategoryRecord[]; units: ProductUnitRecord[] }>("/api/product-references");
      const category = references.data.categories.find((item) => item.categoryCode === (payload.category?.code || payload.category?.name));
      const unit = references.data.units.find((item) => item.unitCode === (payload.unit?.code || payload.unit?.name));
      const response = await axios.put<ProductRecord>(
        `${API_BASE_URL}/${payload.id}`,
        {
          productCode: payload.code,
          productName: payload.name,
          productCategoryId: category?.productCategoryId,
          unitId: unit?.unitId,
          defaultSellingPrice: payload.pricePerUnit,
        },
      );
      return toView(response.data, 0, references.data.categories, references.data.units);
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
    throw new Error("Bulk clearing is disabled for Products. Import must be non-destructive.");
  },
};

export default productService;
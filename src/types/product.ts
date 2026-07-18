import { Supplier } from "@/types/supplier";
import { ProductCategory } from "@/types/product-category";
import { ProductUnit } from "@/types/product-unit";

export type ProductStatus = "Out of Stock" | "In Stock" | "Low stock";

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  description: string;
  unit: ProductUnit;
  costPerUnit: number;
  pricePerUnit: number;
  supplier: Supplier;
  minStock: number;
  begStock: number;
  qtyIn: number;
  actualStock: number;
  reservedUnits: number;
  qtyOut: number;
  status: ProductStatus;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 */
export type CreateProductPayload = Omit<Product, "id">;

/**
 * For Updating: The ID is strictly required to identify the row,
 * but all other fields are optional (Partial) so you can update individual fields.
 */
export type UpdateProductPayload = Pick<Product, "id"> &
  Partial<Omit<Product, "id">>;

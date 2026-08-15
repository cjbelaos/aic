import { Company } from "@/types/company";
import { ProductCategory } from "@/types/product-category";
import { ProductUnit } from "@/types/product-unit";

export interface Product {
  id: string; // prod_<rowNumber> (row-based ID for row targeting)
  code: string;
  name: string;
  category: ProductCategory;
  description: string;
  unit: ProductUnit;
  costPerUnit: number;
  pricePerUnit: number;
  supplier: Company;
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

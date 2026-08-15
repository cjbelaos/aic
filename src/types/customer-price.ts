import { Company } from "./company";
import { Product } from "@/types/product";

export interface CustomerPrice {
  id: string;
  /** The company name string (foreign key to Company). */
  companyName: string;
  /** Optional numeric company ID fallback. */
  companyId?: number | string;
  /** The product code string (foreign key to Product). */
  productCode: string;
  /** Optional numeric product ID fallback. */
  productId?: number | string;
  /** The custom price per unit for this company-product pair. */
  pricePerUnit: number;
  /** Optional alias for pricePerUnit used in some sheets. */
  customPricePerUnit?: number;
  customPriceUnit?: number;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 * The composite unique constraint on (companyName, productCode) is enforced
 * at the service / sheets layer.
 */
export type CreateCustomerPricePayload = Omit<CustomerPrice, "id">;

/**
 * For Updating: The ID is strictly required to identify the row,
 * but all other fields are optional (Partial) so you can update individual fields.
 */
export type UpdateCustomerPricePayload = Pick<CustomerPrice, "id"> &
  Partial<Omit<CustomerPrice, "id">>;

import { Customer } from "./customer";
import { Product } from "@/types/product";

export interface CustomerPrice {
  id: string;
  /** The customer name string (foreign key to Customer). */
  customerName: string;
  /** Optional numeric customer ID fallback. */
  customerId?: number | string;
  /** The product code string (foreign key to Product). */
  productCode: string;
  /** Optional numeric product ID fallback. */
  productId?: number | string;
  /** The custom price per unit for this customer-product pair. */
  pricePerUnit: number;
  /** Optional alias for pricePerUnit used in some sheets. */
  customPricePerUnit?: number;
  customPriceUnit?: number;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 * The composite unique constraint on (customerName, productCode) is enforced
 * at the service / sheets layer.
 */
export type CreateCustomerPricePayload = Omit<CustomerPrice, "id">;

/**
 * For Updating: The ID is strictly required to identify the row,
 * but all other fields are optional (Partial) so you can update individual fields.
 */
export type UpdateCustomerPricePayload = Pick<CustomerPrice, "id"> &
  Partial<Omit<CustomerPrice, "id">>;

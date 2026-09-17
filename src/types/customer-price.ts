import type { RecordStatus } from "@/types/product-record";

/**
 * Canonical customer price record (rows in the `CustomerPrices` tab).
 * Schema: CustomerProductPriceId | CustomerId | ProductId | CustomerProductName |
 * PricePerUnit | EffectiveFrom | EffectiveTo | Status | CreatedAt | CreatedBy | UpdatedAt | UpdatedBy.
 *
 * The fields below the audit block (`id`, `companyId`, `companyName`,
 * `productCode`, ...) are enrichment fields produced by the `/api/customer-prices`
 * read path so existing dashboard consumers keep receiving the flat display fields.
 */
export interface CustomerPrice {
  customerProductPriceId: string;
  customerId: string;
  productId: string;
  customerProductName?: string;
  pricePerUnit: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  status: RecordStatus;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Enriched read-only alias for customerProductPriceId. */
  id?: string;
  companyId?: string;
  companyName?: string;
  productCode?: string;
  customPricePerUnit?: number;
  customPriceUnit?: number;
}

/**
 * For Creating: pricePerUnit is required; customerId/productId may be
 * resolved from companyName/productCode by the API layer.
 */
export type CreateCustomerPricePayload = Pick<CustomerPrice, "pricePerUnit"> &
  Partial<
    Omit<
      CustomerPrice,
      "customerProductPriceId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
    >
  >;

/**
 * For Updating: the record is identified by either `id` (legacy view) or
 * `customerProductPriceId` (canonical view); all other fields are optional.
 */
export type UpdateCustomerPricePayload = (
  | Pick<CustomerPrice, "id">
  | Pick<CustomerPrice, "customerProductPriceId">
) &
  Partial<CreateCustomerPricePayload>;
import type { RecordStatus } from "@/types/product-v2";

export interface CustomerPriceV2 {
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
  sourceVersion?: "v1" | "v2";
}

export type CreateCustomerPriceV2Payload = Omit<
  CustomerPriceV2,
  | "customerProductPriceId"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
  | "sourceVersion"
>;

export type UpdateCustomerPriceV2Payload = Pick<
  CustomerPriceV2,
  "customerProductPriceId"
> & Partial<CreateCustomerPriceV2Payload>;

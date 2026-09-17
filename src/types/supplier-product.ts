import type { RecordStatus } from "@/types/product-record";

/**
 * Canonical supplier product record (rows in the `SupplierProducts` tab).
 * Schema: SupplierProductId | ProductId | SupplierId | SupplierProductCode |
 * SupplierProductName | SupplierDescription | CostPerUnit | IsPreferredSupplier |
 * Status | CreatedAt | CreatedBy | UpdatedAt | UpdatedBy.
 */
export interface SupplierProduct {
  supplierProductId: string;
  productId: string;
  supplierId: string;
  supplierProductCode?: string;
  supplierProductName: string;
  supplierDescription?: string;
  costPerUnit: number;
  isPreferredSupplier: boolean;
  status: RecordStatus;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type CreateSupplierProductPayload = Omit<
  SupplierProduct,
  "supplierProductId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export type UpdateSupplierProductPayload = Pick<
  SupplierProduct,
  "supplierProductId"
> & Partial<CreateSupplierProductPayload>;

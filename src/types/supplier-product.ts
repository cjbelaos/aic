import type { RecordStatus } from "@/types/product-v2";

export interface SupplierProductV2 {
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

export type CreateSupplierProductV2Payload = Omit<
  SupplierProductV2,
  "supplierProductId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export type UpdateSupplierProductV2Payload = Pick<
  SupplierProductV2,
  "supplierProductId"
> & Partial<CreateSupplierProductV2Payload>;

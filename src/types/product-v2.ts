export type RecordStatus = "active" | "inactive";

export interface ProductV2 {
  productId: string;
  productCode: string;
  productName: string;
  productCategoryId: string;
  unitId: string;
  defaultSellingPrice?: number;
  status: RecordStatus;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  sourceVersion?: "v1" | "v2";
}

export type CreateProductV2Payload = Omit<
  ProductV2,
  "productId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "sourceVersion"
>;

export type UpdateProductV2Payload = Pick<ProductV2, "productId"> &
  Partial<CreateProductV2Payload>;

export type RecordStatus = "active" | "inactive";

/**
 * Canonical product record (rows in the `Products` tab).
 * Schema: ProductId | ProductCode | ProductName | ProductCategoryId | UnitId |
 * DefaultSellingPrice | Status | CreatedAt | CreatedBy | UpdatedAt | UpdatedBy.
 */
export interface ProductRecord {
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
}

export type CreateProductRecordPayload = Omit<
  ProductRecord,
  "productId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export type UpdateProductRecordPayload = Pick<ProductRecord, "productId"> &
  Partial<CreateProductRecordPayload>;
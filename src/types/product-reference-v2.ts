import type { RecordStatus } from "@/types/product-v2";

export interface ProductCategoryV2 {
  productCategoryId: string;
  categoryCode: string;
  categoryName: string;
  status: RecordStatus;
}

export interface ProductUnitV2 {
  unitId: string;
  unitCode: string;
  unitName: string;
  status: RecordStatus;
}

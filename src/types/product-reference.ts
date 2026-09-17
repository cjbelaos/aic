import type { RecordStatus } from "@/types/product-record";

/**
 * Canonical product category record (rows in the `ProductCategories` tab).
 * Schema: ProductCategoryId | CategoryCode | CategoryName | Status.
 */
export interface ProductCategoryRecord {
  productCategoryId: string;
  categoryCode: string;
  categoryName: string;
  status: RecordStatus;
}

/**
 * Canonical product unit record (rows in the `ProductUnits` tab).
 * Schema: UnitId | UnitCode | UnitName | Status.
 */
export interface ProductUnitRecord {
  unitId: string;
  unitCode: string;
  unitName: string;
  status: RecordStatus;
}
import type { RecordStatus } from "@/types/product-record";

/**
 * Canonical product category record (rows in the `ProductCategories` tab).
 * Schema: ProductCategoryId | CategoryCode | CategoryName | Status | RequiresSerial.
 */
export interface ProductCategoryRecord {
  productCategoryId: string;
  categoryCode: string;
  categoryName: string;
  status: RecordStatus;
  /** Column E (TRUE/FALSE). DR lines in this category get a "Serial missing" flag. Always set on read. */
  requiresSerial?: boolean;
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
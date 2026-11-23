/** One warehouse × product balance, as returned by /api/inventory. */
export interface StockRow {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  openingDate: string | null;
  onHand: number;
  safetyStock: number;
  available: number;
}

/** One product with its balance per warehouse (cells keyed by warehouseId). */
export interface ProductRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  cells: Record<string, StockRow | undefined>;
  /** Sums over counted warehouses only; uncounted ones count as 0. */
  totalOnHand: number;
  totalAvailable: number;
}

/**
 * Groups stock rows into one row per product, in first-appearance order.
 * Rows for warehouses not in `warehouseIds` are ignored, so cells and totals
 * match the warehouse columns shown.
 */
export function pivotStock(rows: StockRow[], warehouseIds: string[]): ProductRow[] {
  const shown = new Set(warehouseIds);
  const products = new Map<string, ProductRow>();
  for (const row of rows) {
    if (!shown.has(row.warehouseId)) continue;
    let product = products.get(row.productId);
    if (!product) {
      product = {
        productId: row.productId,
        productCode: row.productCode,
        productName: row.productName,
        categoryName: row.categoryName,
        cells: {},
        totalOnHand: 0,
        totalAvailable: 0,
      };
      products.set(row.productId, product);
    }
    product.cells[row.warehouseId] = row;
    if (row.openingDate) {
      product.totalOnHand += row.onHand;
      product.totalAvailable += row.available;
    }
  }
  return [...products.values()];
}

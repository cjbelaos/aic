import { getProductsOnly } from "@/lib/productSheets";
import { getProductCategories } from "@/lib/productReferenceSheets";
import { getWarehouses } from "@/lib/warehouseSheets";
import { inventoryRoute } from "@/lib/inventory/http";
import { loadBalances } from "@/lib/inventory/service";
import { stockKey } from "@/lib/inventory/domain";

/** Stock on hand for every tracked product at every active warehouse. */
export async function GET() {
  return inventoryRoute(async ({ level }) => {
    const [{ balances, tracked }, products, categories, warehouses] = await Promise.all([
      loadBalances(),
      getProductsOnly(),
      getProductCategories(),
      getWarehouses(),
    ]);
    const categoryById = new Map(categories.map((c) => [c.productCategoryId, c.categoryName]));
    const active = warehouses.filter((w) => w.active);
    const rows = products
      .filter((p) => tracked.has(p.productId))
      .flatMap((p) => active.map((w) => {
        const b = balances.get(stockKey(w.warehouseId, p.productId));
        return {
          warehouseId: w.warehouseId,
          warehouseName: w.name,
          productId: p.productId,
          productCode: p.productCode,
          productName: p.productName,
          categoryName: categoryById.get(p.productCategoryId) ?? "",
          openingDate: b?.openingDate ?? null,
          onHand: b?.onHand ?? 0,
          safetyStock: b?.safetyStock ?? 0,
          available: b?.available ?? 0,
        };
      }));
    const trackedProducts = products
      .filter((p) => tracked.has(p.productId))
      .map((p) => ({ productId: p.productId, productCode: p.productCode, productName: p.productName }));
    return { level, warehouses: active.map((w) => ({ warehouseId: w.warehouseId, name: w.name })), products: trackedProducts, rows };
  });
}

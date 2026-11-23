import { getDeliveryReceipts } from "@/lib/deliverySheets";
import { inventoryRoute } from "@/lib/inventory/http";
import { loadBalances } from "@/lib/inventory/service";
import { listTransfers } from "@/lib/inventory/sheets";
import { getProductsOnly } from "@/lib/productSheets";
import { getWarehouses } from "@/lib/warehouseSheets";
import { checkLines, drCheckLines } from "@/lib/inventory/domain";

/** DRs and transfers waiting for safety-stock approval, with what each would consume. */
export async function GET() {
  return inventoryRoute(async ({ level }) => {
    const [receipts, transfers, { balances, tracked }, products, warehouses] = await Promise.all([
      getDeliveryReceipts(),
      listTransfers(),
      loadBalances(),
      getProductsOnly(),
      getWarehouses(),
    ]);
    const idByCode = new Map(products.map((p) => [p.productCode.toLowerCase(), p.productId]));
    const productName = new Map(products.map((p) => [p.productId, p.productName]));
    const warehouseName = new Map(warehouses.map((w) => [w.warehouseId, w.name]));
    const resolve = (l: { productId?: string; productCode?: string }) => l.productId || idByCode.get(String(l.productCode ?? "").toLowerCase()) || "";
    const describe = (warehouseId: string, lines: { warehouseId?: string; productId: string; quantity: number }[]) => {
      const check = checkLines(balances, warehouseId, lines, tracked);
      return {
        ...check,
        lines: check.lines.map((l) => ({ ...l, productName: productName.get(l.productId) ?? l.productId, warehouseName: warehouseName.get(l.warehouseId) ?? l.warehouseId })),
      };
    };
    // A DR's warehouses in first-seen order across its line parts ("A, B").
    const drWarehouseNames = (parts: { warehouseId: string }[], fallback: string) => {
      const ids = [...new Set(parts.map((p) => p.warehouseId))];
      return (ids.length ? ids : [fallback]).map((id) => warehouseName.get(id) ?? id).join(", ");
    };
    const deliveries = receipts
      .filter((r) => r.status.trim().toLowerCase() === "pending_approval")
      .map((r) => {
        const parts = drCheckLines(r.items.map((item) => ({ ...item, productId: resolve(item) })), r.warehouseId ?? "");
        return {
          kind: "DR" as const,
          id: String(r.drNumber),
          label: `Delivery to ${r.companyName}`,
          date: r.date,
          warehouseId: r.warehouseId ?? "",
          warehouseName: drWarehouseNames(parts, r.warehouseId ?? ""),
          requestedBy: r.createdBy ?? "",
          preparedBy: r.preparedBy,
          check: describe(r.warehouseId ?? "", parts),
        };
      });
    const moves = transfers
      .filter((t) => t.status === "pending_approval")
      .map((t) => ({
        kind: "TRANSFER" as const,
        id: t.transferId,
        label: `Transfer ${t.transferNo} to ${warehouseName.get(t.toWarehouseId) ?? t.toWarehouseId}`,
        date: t.date,
        warehouseId: t.fromWarehouseId,
        warehouseName: warehouseName.get(t.fromWarehouseId) ?? t.fromWarehouseId,
        requestedBy: t.createdBy,
        preparedBy: t.preparedBy,
        check: describe(t.fromWarehouseId, t.items.map((i) => ({ productId: i.productId, quantity: i.qty }))),
      }));
    return { level, items: [...deliveries, ...moves] };
  });
}

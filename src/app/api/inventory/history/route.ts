import { inventoryRoute } from "@/lib/inventory/http";
import { listDrStockLines, listMovements, listTransfers } from "@/lib/inventory/sheets";
import { isCountedDrStatus, toIsoDate } from "@/lib/inventory/domain";

/** Movement history for one warehouse + product, newest first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  return inventoryRoute(async () => {
    const [movements, drLines, transfers] = await Promise.all([listMovements(), listDrStockLines(), listTransfers()]);
    const transferNo = new Map(transfers.map((t) => [t.transferId, t.transferNo]));
    const rows = [
      ...movements
        .filter((m) => m.warehouseId === warehouseId && m.productId === productId)
        .map((m) => ({
          id: m.movementId,
          date: toIsoDate(m.date) ?? m.date,
          type: m.type as string,
          qty: m.qty,
          status: m.status as string,
          referenceNo: m.referenceNo,
          note: m.note,
          by: m.createdBy,
          source: m.sourceType === "TRANSFER"
            ? { kind: "TRANSFER", id: m.sourceId, label: transferNo.get(m.sourceId) ?? m.sourceId }
            : { kind: "ENTRY", id: m.movementId, label: m.referenceNo || m.movementId },
        })),
      ...drLines
        .filter((l) => l.warehouseId === warehouseId && l.productId === productId
          && (isCountedDrStatus(l.status) || l.status.trim().toLowerCase() === "pending_approval"))
        .map((l) => {
          const label = l.drNumber > 0 ? `DR #${l.drNumber}` : "Pending DR";
          return {
            id: `DR-${l.drNumber}-${l.productId}`,
            date: toIsoDate(l.date) ?? l.date,
            type: "DR",
            qty: -l.quantity,
            status: isCountedDrStatus(l.status) ? "active" : "pending_approval",
            referenceNo: label,
            note: "",
            by: "",
            source: { kind: "DR", id: String(l.drNumber), label },
          };
        }),
    ];
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { rows };
  });
}

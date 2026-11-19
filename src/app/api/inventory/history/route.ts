import { inventoryRoute } from "@/lib/inventory/http";
import { listDrStockLines, listMovements, listTransfers } from "@/lib/inventory/sheets";
import { buildHistoryRows } from "@/lib/inventory/domain";

/**
 * Movement history, newest first. With warehouseId and productId it is one
 * row's history; leave either out to include all (used by the export).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  return inventoryRoute(async () => {
    const [movements, drLines, transfers] = await Promise.all([listMovements(), listDrStockLines(), listTransfers()]);
    const transferNos = new Map(transfers.map((t) => [t.transferId, t.transferNo]));
    return { rows: buildHistoryRows({ movements, drLines, transferNos, warehouseId, productId }) };
  });
}

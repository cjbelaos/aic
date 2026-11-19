import { inventoryRoute } from "@/lib/inventory/http";
import { previewCheck } from "@/lib/inventory/service";

/** Stock check preview for the DR and transfer forms (hints only; saves re-check). */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    warehouseId?: string;
    lines?: { productId?: string; productCode?: string; quantity: number }[];
    excludeDrNumber?: number;
    excludeTransferId?: string;
  };
  return inventoryRoute(async ({ level }) => {
    if (!body.warehouseId) return { level, check: { result: "ok", lines: [] } };
    const exclude = body.excludeDrNumber !== undefined || body.excludeTransferId
      ? { drNumber: body.excludeDrNumber, transferId: body.excludeTransferId }
      : undefined;
    return { level, check: await previewCheck({ warehouseId: body.warehouseId, lines: body.lines ?? [], exclude }) };
  });
}

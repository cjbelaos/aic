import { inventoryRoute } from "@/lib/inventory/http";
import { setSafetyStock } from "@/lib/inventory/service";

export async function PUT(request: Request) {
  const body = (await request.json()) as { warehouseId?: string; productId?: string; qty?: number };
  return inventoryRoute(async ({ actor }) => {
    await setSafetyStock({
      warehouseId: String(body.warehouseId ?? ""),
      productId: String(body.productId ?? ""),
      qty: Number(body.qty),
    }, actor);
    return { success: true };
  });
}

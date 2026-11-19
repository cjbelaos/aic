import { inventoryRoute } from "@/lib/inventory/http";
import { voidEntry } from "@/lib/inventory/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  return inventoryRoute(async ({ actor }) => {
    await voidEntry(id, actor);
    return { success: true };
  });
}

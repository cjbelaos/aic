import { inventoryRoute } from "@/lib/inventory/http";
import { cancelTransfer } from "@/lib/inventory/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  return inventoryRoute(async ({ actor }) => cancelTransfer(id, actor));
}

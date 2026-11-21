import { prRoute, readJson } from "@/lib/purchaseRequests/http";
import { markFromStock, undoFromStock } from "@/lib/purchaseRequests/service";

type Context = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { itemId } = await params;
  const body = await readJson<{ qty?: number; note?: string }>(request);
  return prRoute((session) => markFromStock(itemId, Number(body.qty), String(body.note ?? ""), session));
}

export async function DELETE(_request: Request, { params }: Context) {
  const { itemId } = await params;
  return prRoute((session) => undoFromStock(itemId, session));
}

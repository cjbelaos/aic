import { prRoute, readJson } from "@/lib/purchaseRequests/http";
import { getPurchaseRequest, updatePurchaseRequest, type PrDraftInput } from "@/lib/purchaseRequests/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  return prRoute((session) => getPurchaseRequest(id, session));
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await readJson<PrDraftInput>(request);
  return prRoute((session) => updatePurchaseRequest(id, body, session));
}

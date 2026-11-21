import { prRoute } from "@/lib/purchaseRequests/http";
import { submitPurchaseRequest } from "@/lib/purchaseRequests/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  return prRoute((session) => submitPurchaseRequest(id, session));
}

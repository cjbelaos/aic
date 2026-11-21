import { prRoute, readJson } from "@/lib/purchaseRequests/http";
import { cancelPurchaseRequest } from "@/lib/purchaseRequests/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await readJson<{ reason?: string }>(request);
  return prRoute((session) => cancelPurchaseRequest(id, String(body.reason ?? ""), session));
}

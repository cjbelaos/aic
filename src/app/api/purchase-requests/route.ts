import { prRoute, readJson } from "@/lib/purchaseRequests/http";
import { createPurchaseRequest, listPurchaseRequests, type PrDraftInput } from "@/lib/purchaseRequests/service";

export async function GET() {
  return prRoute((session) => listPurchaseRequests(session));
}

export async function POST(request: Request) {
  const body = await readJson<PrDraftInput>(request);
  return prRoute((session) => createPurchaseRequest(body, session), 201);
}

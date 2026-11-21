import { prRoute, readJson } from "@/lib/purchaseRequests/http";
import { cancelRemaining } from "@/lib/purchaseRequests/service";

type Context = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { itemId } = await params;
  const body = await readJson<{ qty?: number; reason?: string }>(request);
  return prRoute((session) => cancelRemaining(itemId, Number(body.qty), String(body.reason ?? ""), session));
}

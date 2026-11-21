import { prRoute } from "@/lib/purchaseRequests/http";
import { getContractDue } from "@/lib/purchaseRequests/service";

type Context = { params: Promise<{ contractId: string }> };

/** A contract's active items with what is still due this period (?excludePr= the PR being edited). */
export async function GET(request: Request, { params }: Context) {
  const { contractId } = await params;
  const excludePr = new URL(request.url).searchParams.get("excludePr") || undefined;
  return prRoute(() => getContractDue(contractId, excludePr));
}

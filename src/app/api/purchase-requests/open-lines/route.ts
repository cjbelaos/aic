import { prRoute } from "@/lib/purchaseRequests/http";
import { listOpenPrLines } from "@/lib/purchaseRequests/service";

export async function GET(request: Request) {
  const excludePo = new URL(request.url).searchParams.get("excludePo") || undefined;
  return prRoute(() => listOpenPrLines(excludePo));
}

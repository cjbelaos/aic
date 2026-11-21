import { prRoute } from "@/lib/purchaseRequests/http";
import { listEligibleSalesOrders } from "@/lib/purchaseRequests/service";

/** Narrow read-only list of Confirmed Sales Orders for the PR form (the Sales Orders module stays Admin-only). */
export async function GET() {
  return prRoute(() => listEligibleSalesOrders());
}

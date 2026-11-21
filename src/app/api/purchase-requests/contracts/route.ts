import { prRoute } from "@/lib/purchaseRequests/http";
import { listEligibleContracts } from "@/lib/purchaseRequests/service";

/** Narrow read-only list of Active customer contracts for the PR form. */
export async function GET() {
  return prRoute(() => listEligibleContracts());
}

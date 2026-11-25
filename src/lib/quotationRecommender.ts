import { resolveRecommendedBy, type ResolvedRecommender } from "./recommendedBy";
import { QuotationError } from "./quotationTerms";
import { getUsers } from "./userSheets";

/**
 * Resolves the "Recommended by" technician a client sent, against the Users
 * sheet. The stored name always comes from here, never from the client.
 */
export async function resolveQuotationRecommender(userId: unknown): Promise<ResolvedRecommender> {
  const id = String(userId ?? "").trim();
  if (!id) return { recommendedByUserId: "", recommendedByName: "" };
  const resolved = resolveRecommendedBy(id, await getUsers());
  if ("error" in resolved) throw new QuotationError(resolved.error, 400);
  return resolved;
}

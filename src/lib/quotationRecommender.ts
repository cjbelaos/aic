import { resolveRecommendedBy, type ResolvedRecommender } from "./recommendedBy";
import { QuotationError } from "./quotationTerms";
import { getUsers } from "./userSheets";

/**
 * Resolves the "Recommended by" technician a client sent, against the Users
 * sheet. The stored name always comes from here, never from the client.
 */
/** `stored` (the quotation being edited) keeps an unchanged recommender as is. */
export async function resolveQuotationRecommender(userId: unknown, stored?: ResolvedRecommender): Promise<ResolvedRecommender> {
  const id = String(userId ?? "").trim();
  if (!id) return { recommendedByUserId: "", recommendedByName: "" };
  if (stored && stored.recommendedByUserId === id) return stored;
  const resolved = resolveRecommendedBy(id, await getUsers(), stored);
  if ("error" in resolved) throw new QuotationError(resolved.error, 400);
  return resolved;
}

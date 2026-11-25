import { resolveRecommendedBy, type ResolvedRecommender } from "../recommendedBy";
import { getUsers } from "../userSheets";
import { validationError } from "./errors";

/**
 * Resolves a Sales Order's "Recommended by" technician against the Users sheet.
 * `undefined` input means "unchanged" (update payloads that omit the field).
 */
export async function resolveOrderRecommender(userId: string | undefined): Promise<ResolvedRecommender | undefined> {
  if (userId === undefined) return undefined;
  if (!userId.trim()) return { recommendedByUserId: "", recommendedByName: "" };
  const resolved = resolveRecommendedBy(userId, await getUsers());
  if ("error" in resolved) throw validationError(resolved.error, { recommendedByUserId: resolved.error });
  return resolved;
}

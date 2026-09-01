/**
 * Executive positions may act as approvers for ANY user regardless of
 * department. All other approvers must belong to the same department as the
 * requester.
 *
 * Executives are identified by their Position Title (Positions sheet):
 * General Manager, CFO, COO, CEO (including common abbreviations/expansions).
 */

const EXECUTIVE_POSITION_TITLES = new Set([
  "general manager",
  "gm",
  "cfo",
  "coo",
  "ceo",
  "chief financial officer",
  "chief operating officer",
  "chief executive officer",
]);

export function normalizePositionTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isExecutivePositionTitle(
  title: string | undefined | null,
): boolean {
  if (!title) return false;
  return EXECUTIVE_POSITION_TITLES.has(normalizePositionTitle(title));
}

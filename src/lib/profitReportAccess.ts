import { getPositions } from "@/lib/positionSheets";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import type { SessionUser } from "@/types/user";

/**
 * Confidential company profit reports — the Monthly Profit Summary and the
 * Technician Earnings report — are visible ONLY to the CEO, CFO, COO and the
 * Super Admin allow-list.
 *
 * Positions are matched on their title from the Positions master sheet so the
 * rule never depends on mutable numeric IDs (same approach as
 * `technicianEarningsAccess`). Full executive titles are accepted alongside the
 * common abbreviations so either spelling in the sheet works.
 */
const PROFIT_REPORT_POSITION_TITLES = new Set([
  "ceo",
  "cfo",
  "coo",
  "chief executive officer",
  "chief financial officer",
  "chief operating officer",
]);

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, " ");
}

export function isProfitReportPositionTitle(
  title: string | null | undefined,
): boolean {
  if (!title) return false;
  return PROFIT_REPORT_POSITION_TITLES.has(normalizeTitle(title));
}

/**
 * Determines whether a session may view the confidential profit reports.
 */
export async function canAccessProfitReports(
  session: SessionUser,
): Promise<boolean> {
  if (isSuperAdmin(session)) return true;
  const positions = await getPositions();
  const position = positions.find((item) => item.positionId === session.positionId);
  return isProfitReportPositionTitle(position?.positionTitle);
}

import { getDepartments } from "@/lib/departmentSheets";
import { getPositions } from "@/lib/positionSheets";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { canAccessProfitReports } from "@/lib/profitReportAccess";
import type { SessionUser } from "@/types/user";

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, " ");
}

/**
 * After Sales department managers own the fuel-price settings and the FTI
 * workflow. Position and department titles are resolved from their master
 * sheets so this rule does not depend on mutable numeric IDs.
 */
export async function isAfterSalesManager(
  session: SessionUser,
): Promise<boolean> {
  const [departments, positions] = await Promise.all([
    getDepartments(),
    getPositions(),
  ]);
  const department = departments.find(
    (item) => item.departmentId === session.departmentId,
  );
  const position = positions.find(
    (item) => item.positionId === session.positionId,
  );
  const departmentName = normalizeTitle(department?.departmentName ?? "");
  const positionTitle = normalizeTitle(position?.positionTitle ?? "");

  return departmentName === "after sales" && positionTitle === "manager";
}

/**
 * Technician Earnings is a confidential profit report (CEO, CFO, COO or the
 * Super Admin allow-list) with one extra audience: the After Sales Manager,
 * who owns the technician workflow. The Monthly Profit Summary does NOT grant
 * this exception — it stays restricted to the executives.
 */
export async function canAccessTechnicianEarnings(
  session: SessionUser,
): Promise<boolean> {
  if (await canAccessProfitReports(session)) return true;
  return isAfterSalesManager(session);
}

/**
 * Fuel-price settings are owned by the After Sales Manager. Super Admins are
 * allowed through as well so a single account can operate every page.
 */
export async function canManageFuelPrice(
  session: SessionUser,
): Promise<boolean> {
  if (isSuperAdmin(session)) return true;
  return isAfterSalesManager(session);
}

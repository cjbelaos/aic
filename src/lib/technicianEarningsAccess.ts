import { getDepartments } from "@/lib/departmentSheets";
import { getPositions } from "@/lib/positionSheets";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import type { SessionUser } from "@/types/user";

const EXECUTIVE_POSITIONS = new Set(["general manager", "cfo", "coo", "ceo"]);

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, " ");
}

/**
 * Determines whether a session may view the technician earnings report.
 * Position and department titles are resolved from their master sheets so this
 * rule does not depend on mutable numeric IDs.
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

export async function canAccessTechnicianEarnings(
  session: SessionUser,
): Promise<boolean> {
  if (isSuperAdmin(session)) return true;
  if (await isAfterSalesManager(session)) return true;
  const positions = await getPositions();
  const position = positions.find((item) => item.positionId === session.positionId);
  return EXECUTIVE_POSITIONS.has(normalizeTitle(position?.positionTitle ?? ""));
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

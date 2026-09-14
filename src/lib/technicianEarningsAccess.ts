import { getDepartments } from "@/lib/departmentSheets";
import { getPositions } from "@/lib/positionSheets";
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
export async function canAccessTechnicianEarnings(
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

  return (
    (departmentName === "after sales" && positionTitle === "manager") ||
    EXECUTIVE_POSITIONS.has(positionTitle)
  );
}

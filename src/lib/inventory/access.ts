import { NextResponse } from "next/server";
import { getPositions } from "@/lib/positionSheets";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { accessLevelFor, canPerform, type AccessLevel, type InventoryAction } from "@/lib/inventory/domain";
import type { SessionUser } from "@/types/user";

/** Inventory access level from the user's Position title (Positions sheet). */
export async function getAccessLevel(session: SessionUser): Promise<AccessLevel> {
  const positions = await getPositions().catch(() => []);
  const position = positions.find((item) => item.positionId === session.positionId);
  return accessLevelFor({ positionTitle: position?.positionTitle ?? "", superAdmin: isSuperAdmin(session) });
}

/** Resolves the level and refuses with 403 when it does not allow the action. */
export async function requireInventoryAction(session: SessionUser, action: InventoryAction): Promise<AccessLevel | Response> {
  const level = await getAccessLevel(session);
  if (!canPerform(level, action)) {
    return NextResponse.json({ error: "You do not have permission for this inventory action." }, { status: 403 });
  }
  return level;
}

import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getAccessLevel } from "@/lib/inventory/access";
import { inventoryErrorResponse } from "@/lib/inventory/drGuard";
import type { AccessLevel } from "@/lib/inventory/domain";
import type { SessionUser } from "@/types/user";

/** Shared wrapper for inventory routes: session, access level and error mapping. */
export async function inventoryRoute(
  work: (ctx: { session: SessionUser; level: AccessLevel; actor: { userId: string; level: AccessLevel } }) => Promise<unknown>,
  status = 200,
): Promise<Response> {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const level = await getAccessLevel(session);
    return NextResponse.json(await work({ session, level, actor: { userId: session.userId, level } }), { status });
  } catch (error) {
    const mapped = inventoryErrorResponse(error);
    if (mapped) return mapped;
    const known = (error as { status?: number }).status;
    if (known && known >= 400 && known < 500) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: known });
    }
    console.error("Inventory request failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inventory request failed." }, { status: 500 });
  }
}

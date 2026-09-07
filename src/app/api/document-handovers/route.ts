import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedSession,
  isAdminRole,
} from "@/lib/auth/session";
import { getDocumentHandovers } from "@/lib/documentHandoverSheets";

/**
 * GET /api/document-handovers
 * Fetches document handovers with optional filters.
 * Query params:
 *   - filter: "pending" | "stats" | undefined (all)
 *   - assignedToId: scope results to a specific assignee (admins only)
 *
 * Access control:
 *   - Admins may view all handovers, or scope by ?assignedToId=.
 *   - Non-admins are always scoped to documents assigned to themselves.
 */
export async function GET(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter");
    const requestedAssignee = searchParams.get("assignedToId") || "";

    let handovers = await getDocumentHandovers();

    if (isAdminRole(session.userRoleId)) {
      if (requestedAssignee) {
        handovers = handovers.filter(
          (h) => h.assignedToId === requestedAssignee,
        );
      }
    } else {
      handovers = handovers.filter((h) => h.assignedToId === session.userId);
    }

    let data;
    if (filter === "pending") {
      data = handovers.filter((h) => h.status === "handed_over");
    } else if (filter === "stats") {
      data = {
        total: handovers.length,
        handedOver: handovers.filter((h) => h.status === "handed_over")
          .length,
        returned: handovers.filter((h) => h.status === "returned").length,
      };
    } else {
      data = handovers;
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch document handovers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

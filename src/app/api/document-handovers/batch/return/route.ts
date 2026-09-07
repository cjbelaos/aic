import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedSession,
  isAdminRole,
} from "@/lib/auth/session";
import {
  getDocumentHandovers,
  returnDocumentHandovers,
} from "@/lib/documentHandoverSheets";

/**
 * PUT /api/document-handovers/batch/return
 * Marks multiple document handovers as returned.
 * Non-admins may only return documents assigned to themselves.
 */
export async function PUT(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const { ids, notes } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "At least one ID is required." },
        { status: 400 },
      );
    }

    // Ownership check: drop any IDs that don't belong to a non-admin.
    let allowedIds = ids;
    if (!isAdminRole(session.userRoleId)) {
      const handovers = await getDocumentHandovers();
      const ownIds = new Set(
        handovers
          .filter((h) => h.assignedToId === session.userId)
          .map((h) => h.id),
      );
      allowedIds = ids.filter((id: string) => ownIds.has(id));
    }

    if (allowedIds.length === 0) {
      return NextResponse.json(
        { error: "Forbidden. You can only return documents assigned to you." },
        { status: 403 },
      );
    }

    await returnDocumentHandovers({
      ids,
      returnedBy: session.userId,
      returnedByName: session.fullName,
      notes,
    });

    return NextResponse.json(
      { message: "Documents marked as returned successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to return handovers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
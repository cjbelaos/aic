import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedSession,
  isAdminRole,
} from "@/lib/auth/session";
import {
  getDocumentHandovers,
  verifyDocumentHandovers,
} from "@/lib/documentHandoverSheets";

/**
 * GET /api/document-handovers/[id]
 * Fetches a single document handover by ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const handovers = await getDocumentHandovers();
    const handover = handovers.find((h) => h.id === id);

    if (!handover) {
      return NextResponse.json(
        { error: `Document handover with ID ${id} not found.` },
        { status: 404 },
      );
    }

    if (
      !isAdminRole(session.userRoleId) &&
      handover.assignedToId !== session.userId
    ) {
      return NextResponse.json(
        { error: "Forbidden. You can only view documents assigned to you." },
        { status: 403 },
      );
    }

    return NextResponse.json(handover, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch handover.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/document-handovers/[id]/return
 * Marks a single document handover as returned.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body = await request.json();
    const { notes } = body;

    // Only admins can complete the final verification step.
    const handovers = await getDocumentHandovers();
    const handover = handovers.find((h) => h.id === id);

    if (!handover) {
      return NextResponse.json(
        { error: `Document handover with ID ${id} not found.` },
        { status: 404 },
      );
    }

    if (
      !isAdminRole(session.userRoleId)
    ) {
      return NextResponse.json(
        { error: "Forbidden. Only admins can verify returned documents." },
        { status: 403 },
      );
    }

    await verifyDocumentHandovers({
      ids: [id],
      actorId: session.userId,
      actorName: session.fullName,
      notes,
    });

    return NextResponse.json(
      { message: `Document handover ${id} marked as returned.` },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to return handover.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

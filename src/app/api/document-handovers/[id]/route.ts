import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getDocumentHandovers,
  returnDocumentHandovers,
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

    await returnDocumentHandovers({
      ids: [id],
      returnedBy: session.userId,
      returnedByName: session.fullName,
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

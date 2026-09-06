import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { returnDocumentHandovers } from "@/lib/documentHandoverSheets";

/**
 * PUT /api/document-handovers/batch/return
 * Marks multiple document handovers as returned.
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
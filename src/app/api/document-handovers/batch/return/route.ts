import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import {
  verifyDocumentHandovers,
} from "@/lib/documentHandoverSheets";

/**
 * PUT /api/document-handovers/batch/return
 * Marks multiple document handovers as returned.
 * Non-admins may only return documents assigned to themselves.
 */
export async function PUT(request: NextRequest) {
  const session = await requireAdminSession();
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

    await verifyDocumentHandovers({
      ids,
      actorId: session.userId,
      actorName: session.fullName,
      notes,
    });

    return NextResponse.json(
      { message: "Documents verified by Admin successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to return handovers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

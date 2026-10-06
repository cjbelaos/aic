import { NextRequest, NextResponse } from "next/server";
import { isAdminUser, requireAuthenticatedSession } from "@/lib/auth/session";
import { canReceiveAndVerifyDocuments } from "@/lib/documentHandoverWorkflow";
import { verifyDocumentHandovers } from "@/lib/documentHandoverSheets";

export async function PUT(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!isAdminUser(session) && !canReceiveAndVerifyDocuments(session)) {
    return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
  }
  try {
    const { ids, notes } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "At least one ID is required." }, { status: 400 });
    await verifyDocumentHandovers({ ids, actorId: session.userId, actorName: session.fullName, notes });
    return NextResponse.json({ message: "Documents verified by Admin." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to verify documents." }, { status: 500 });
  }
}

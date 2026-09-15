import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { unassignDocumentHandovers } from "@/lib/documentHandoverSheets";
import { isAfterSalesDocumentReceiver } from "@/lib/documentHandoverWorkflow";

export async function PUT(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!isAfterSalesDocumentReceiver(session)) {
    return NextResponse.json({ error: "Only the designated After Sales receiver can unassign documents." }, { status: 403 });
  }
  try {
    const { ids, notes } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "At least one ID is required." }, { status: 400 });
    await unassignDocumentHandovers({ ids, actorId: session.userId, actorName: session.fullName, notes });
    return NextResponse.json({ message: "Documents unassigned." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to unassign documents." }, { status: 500 });
  }
}

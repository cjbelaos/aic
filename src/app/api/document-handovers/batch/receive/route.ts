import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { receiveDocumentHandovers } from "@/lib/documentHandoverSheets";
import { isAfterSalesDocumentReceiver } from "@/lib/documentHandoverWorkflow";

export async function PUT(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!isAfterSalesDocumentReceiver(session)) {
    return NextResponse.json({ error: "Only the designated After Sales receiver can confirm receipt." }, { status: 403 });
  }
  try {
    const { ids, notes } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "At least one ID is required." }, { status: 400 });
    await receiveDocumentHandovers({ ids, actorId: session.userId, actorName: session.fullName, notes });
    return NextResponse.json({ message: "Documents received by After Sales." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to receive documents." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { verifyDocumentHandovers } from "@/lib/documentHandoverSheets";

export async function PUT(request: NextRequest) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;
  try {
    const { ids, notes } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "At least one ID is required." }, { status: 400 });
    await verifyDocumentHandovers({ ids, actorId: session.userId, actorName: session.fullName, notes });
    return NextResponse.json({ message: "Documents verified by Admin." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to verify documents." }, { status: 500 });
  }
}

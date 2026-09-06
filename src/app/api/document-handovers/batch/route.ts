import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { createDocumentHandovers } from "@/lib/documentHandoverSheets";
import { CreateDocumentHandoverInput } from "@/types/documentHandover";

/**
 * POST /api/document-handovers/batch
 * Creates multiple document handover records.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const { handovers } = body as { handovers: CreateDocumentHandoverInput[] };

    if (!handovers || !Array.isArray(handovers) || handovers.length === 0) {
      return NextResponse.json(
        { error: "At least one handover is required." },
        { status: 400 },
      );
    }

    const created = await createDocumentHandovers(
      handovers,
      session.userId,
      session.fullName,
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create handovers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

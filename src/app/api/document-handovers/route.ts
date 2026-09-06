import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getDocumentHandovers,
  getDocumentHandoverStats,
  getPendingDocumentHandovers,
} from "@/lib/documentHandoverSheets";

/**
 * GET /api/document-handovers
 * Fetches document handovers with optional filters.
 * Query params:
 *   - filter: "pending" | "stats" | undefined (all)
 */
export async function GET(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter");

    let data;
    if (filter === "pending") {
      data = await getPendingDocumentHandovers();
    } else if (filter === "stats") {
      data = await getDocumentHandoverStats();
    } else {
      data = await getDocumentHandovers();
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch document handovers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

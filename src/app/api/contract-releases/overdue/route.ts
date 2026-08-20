import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getPeriodSummaries } from "@/lib/contractPeriodSummarySheets";

/**
 * GET /api/contract-releases/overdue
 * Fetches all overdue releases (period has passed but releases are incomplete).
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const allSummaries = await getPeriodSummaries();
    const today = new Date();

    const overdue = allSummaries.filter((s) => {
      if (s.status === "Completed") return false;
      const periodEnd = new Date(s.periodEnd);
      return today > periodEnd;
    });

    return NextResponse.json(overdue, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch overdue releases.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
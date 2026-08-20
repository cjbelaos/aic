import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getPeriodSummaries } from "@/lib/contractPeriodSummarySheets";

/**
 * GET /api/contract-period-summaries
 * Fetches period summaries, optionally filtered.
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const contractItemId = searchParams.get("contractItemId") || undefined;
    const contractId = searchParams.get("contractId") || undefined;
    const periodYear = searchParams.get("periodYear")
      ? parseInt(searchParams.get("periodYear")!, 10)
      : undefined;
    const periodMonth = searchParams.get("periodMonth")
      ? parseInt(searchParams.get("periodMonth")!, 10)
      : undefined;

    const summaries = await getPeriodSummaries(
      contractItemId,
      periodYear,
      periodMonth,
      contractId,
    );
    return NextResponse.json(summaries, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch period summaries.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
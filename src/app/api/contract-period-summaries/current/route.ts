import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { manilaToday } from "@/lib/contractStatus";
import { getComputedPeriodSummaries } from "@/lib/contractReleases/source";

/**
 * GET /api/contract-period-summaries/current?contractId=CTR-0001
 * Fetches current period status for a contract.
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");

    if (!contractId?.trim()) {
      return NextResponse.json(
        { error: "Contract ID is required." },
        { status: 400 },
      );
    }

    const today = manilaToday();
    const all = await getComputedPeriodSummaries(undefined, undefined, undefined, contractId);
    const status = all.filter((s) => s.periodStart <= today && today <= s.periodEnd);
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch current period status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
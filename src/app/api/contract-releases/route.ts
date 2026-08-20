import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getContractReleases } from "@/lib/contractReleaseSheets";

/**
 * GET /api/contract-releases
 * Fetches contract releases, optionally filtered by contractItemId, periodYear, periodMonth.
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const contractItemId = searchParams.get("contractItemId") || undefined;
    const periodYear = searchParams.get("periodYear")
      ? parseInt(searchParams.get("periodYear")!, 10)
      : undefined;
    const periodMonth = searchParams.get("periodMonth")
      ? parseInt(searchParams.get("periodMonth")!, 10)
      : undefined;

    const releases = await getContractReleases(contractItemId, periodYear, periodMonth);
    return NextResponse.json(releases, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch contract releases.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
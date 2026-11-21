import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { effectiveContractStatus } from "@/lib/contractStatus";
import { loadLedgers } from "@/lib/contractReleases/source";

/**
 * GET /api/contract-releases/overdue
 * Fetches all overdue releases (period has passed but releases are incomplete).
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { ledgers, contracts, today } = await loadLedgers();
    const active = new Set(
      contracts.filter((c) => effectiveContractStatus(c, today) === "Active").map((c) => c.id),
    );
    const overdue = ledgers
      .filter((l) => active.has(l.contractId))
      .flatMap((l) => l.periods)
      .filter((p) => p.status === "Overdue");

    return NextResponse.json(overdue, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch overdue releases.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
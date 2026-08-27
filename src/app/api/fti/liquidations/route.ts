import { NextRequest, NextResponse } from "next/server";
import { getAllLiquidations } from "@/lib/liquidationSheets";
import { getSession } from "@/lib/auth/session";

/**
 * GET /api/fti/liquidations?controlNos=CTRL-20260812...,CTRL-20260813...
 *
 * Returns a lightweight status map for the requested FTI control numbers
 * so the FTI list page can show which FTIs have linked liquidations and
 * their current statuses without fetching full receipt items for every row.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const controlNosParam = searchParams.get("controlNos");
    if (!controlNosParam) {
      return NextResponse.json({ summaries: {} });
    }

    const requestedControlNos = new Set(
      controlNosParam.split(",").map((s) => s.trim()).filter(Boolean),
    );

    if (requestedControlNos.size === 0) {
      return NextResponse.json({ summaries: {} });
    }

    const allLiquidations = await getAllLiquidations();

    const summaries: Record<string, { liquidationId: string; status: string; userId: string } | null> = {};
    for (const cn of requestedControlNos) {
      const match = allLiquidations.find((l) => l.controlNo === cn);
      summaries[cn] = match
        ? { liquidationId: match.liquidationId, status: match.status, userId: match.userId }
        : null;
    }

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("FTI liquidations summary error:", error);
    return NextResponse.json(
      { error: "Failed to load liquidation summaries." },
      { status: 500 },
    );
  }
}
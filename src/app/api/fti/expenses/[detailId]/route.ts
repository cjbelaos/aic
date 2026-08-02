import { NextRequest, NextResponse } from "next/server";
import { getFTIExpenses, saveFTIExpenses } from "@/lib/ftiSheets";
import { getSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ detailId: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { detailId } = await context.params;
    const expenses = await getFTIExpenses(decodeURIComponent(detailId));
    return NextResponse.json(expenses);
  } catch (error) {
    console.error("FTI expenses fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load FTI expenses" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { detailId } = await context.params;
    const body = await req.json();
    const items = body.items || [];
    const saved = await saveFTIExpenses(decodeURIComponent(detailId), items);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("FTI expenses save error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save FTI expenses",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getFTIDetails, saveFTIDetails, getFTIRequestFull } from "@/lib/ftiSheets";
import { getSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ controlNo: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { controlNo } = await context.params;
    const decoded = decodeURIComponent(controlNo);
    const full = await getFTIRequestFull(decoded);
    if (!full) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isAdmin = session.userRoleId === 1;
    if (!isAdmin && full.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const details = await getFTIDetails(decoded);
    return NextResponse.json(details);
  } catch (error) {
    console.error("FTI details fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load FTI details" },
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

    const { controlNo } = await context.params;
    const decoded = decodeURIComponent(controlNo);
    const full = await getFTIRequestFull(decoded);
    if (!full) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isAdmin = session.userRoleId === 1;
    if (!isAdmin && full.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const items = body.items || [];
    const saved = await saveFTIDetails(decoded, items);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("FTI details save error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save FTI details",
      },
      { status: 500 },
    );
  }
}

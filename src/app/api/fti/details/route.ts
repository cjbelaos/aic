import { NextRequest, NextResponse } from "next/server";
import { appendFTIDetail, updateFTIDetail, deleteFTIDetailRow } from "@/lib/ftiSheets";
import { getSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await req.json();
    const { controlNo, detail, userId } = body;
    if (!controlNo || !detail) return NextResponse.json({ error: "controlNo and detail are required." }, { status: 400 });
    const result = await appendFTIDetail(controlNo, detail, userId || session.userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("FTI detail append error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save FTI detail" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await req.json();
    const { controlNo, detailId, detail, userId } = body;
    if (!controlNo || !detailId || !detail) return NextResponse.json({ error: "controlNo, detailId, and detail are required." }, { status: 400 });
    await updateFTIDetail(controlNo, detailId, detail, userId || session.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("FTI detail update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update FTI detail" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const detailId = searchParams.get("detailId");
    if (!detailId) return NextResponse.json({ error: "detailId is required." }, { status: 400 });
    await deleteFTIDetailRow(decodeURIComponent(detailId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("FTI detail delete error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete FTI detail" }, { status: 500 });
  }
}
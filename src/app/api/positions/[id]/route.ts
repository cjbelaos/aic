import { NextResponse } from "next/server";
import {
  requireAdminSession,
  requireAuthenticatedSession,
} from "@/lib/auth/session";
import { updatePosition, deletePosition } from "@/lib/positionSheets";
import type { UpdatePositionInput } from "@/types/position";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const positionId = parseInt(id, 10);
    if (isNaN(positionId)) {
      return NextResponse.json(
        { error: "Invalid position ID." },
        { status: 400 },
      );
    }

    const body: UpdatePositionInput = await request.json();
    const pos = await updatePosition(positionId, {
      positionTitle: String(body.positionTitle || "").trim(),
    });
    return NextResponse.json(pos, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update position.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const positionId = parseInt(id, 10);
    if (isNaN(positionId)) {
      return NextResponse.json(
        { error: "Invalid position ID." },
        { status: 400 },
      );
    }

    await deletePosition(positionId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete position.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
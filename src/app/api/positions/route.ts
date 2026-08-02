import { NextResponse } from "next/server";
import {
  requireAdminSession,
  requireAuthenticatedSession,
} from "@/lib/auth/session";
import { getPositions, addPosition } from "@/lib/positionSheets";
import type { CreatePositionInput } from "@/types/position";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const positions = await getPositions();
    return NextResponse.json(positions, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch positions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const input: CreatePositionInput = {
      positionTitle: String(body.positionTitle || "").trim(),
    };
    const pos = await addPosition(input);
    return NextResponse.json(pos, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create position.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getAllMiscellaneous,
  addMiscellaneous,
} from "@/lib/miscellaneousSheets";
import type { CreateMiscellaneousInput } from "@/types/miscellaneous";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const items = await getAllMiscellaneous();
    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch miscellaneous.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const input: CreateMiscellaneousInput = {
      code: String(body.code || "").trim(),
      description: String(body.description || "").trim(),
    };
    const item = await addMiscellaneous(input);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create miscellaneous.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

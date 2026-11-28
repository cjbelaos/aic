import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { applyReplacement } from "@/lib/productReplacement/service";
import { ReplacementInputError } from "@/lib/productReplacement/types";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  const session = await requireAdminSession(); if (session instanceof Response) return session;
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { toProductId?: unknown };
    const toProductId = typeof body.toProductId === "string" ? body.toProductId.trim() : "";
    if (!toProductId) return NextResponse.json({ error: "Choose the product that replaces this one." }, { status: 400 });
    return NextResponse.json(await applyReplacement(id, toProductId, session.userId));
  } catch (error) {
    const status = error instanceof ReplacementInputError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to replace the product." }, { status });
  }
}

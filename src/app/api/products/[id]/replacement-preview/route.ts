import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { previewReplacement } from "@/lib/productReplacement/service";
import { ReplacementInputError } from "@/lib/productReplacement/types";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const session = await requireAdminSession(); if (session instanceof Response) return session;
  try {
    const { id } = await params;
    const to = new URL(request.url).searchParams.get("to") ?? "";
    // The edit list is internal; the dialog only needs what will change and what is skipped.
    const plan = await previewReplacement(id, to, session.userId);
    return NextResponse.json({ from: plan.from, to: plan.to, changes: plan.changes, skipped: plan.skipped, conflicts: plan.conflicts });
  } catch (error) {
    const status = error instanceof ReplacementInputError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to preview the replacement." }, { status });
  }
}

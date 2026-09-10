import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateProductV2, updateProductV2 } from "@/lib/productV2Sheets";
import type { UpdateProductV2Payload } from "@/types/product-v2";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; const body = (await request.json()) as Partial<UpdateProductV2Payload>; return NextResponse.json(await updateProductV2({ ...body, productId: id }, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update V2 product." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; return NextResponse.json(await deactivateProductV2(id, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate V2 product." }, { status: 500 }); }
}

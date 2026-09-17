import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateProduct, updateProduct } from "@/lib/productSheets";
import type { UpdateProductRecordPayload } from "@/types/product-record";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; const body = (await request.json()) as Partial<UpdateProductRecordPayload>; return NextResponse.json(await updateProduct({ ...body, productId: id }, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update product." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; return NextResponse.json(await deactivateProduct(id, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate product." }, { status: 500 }); }
}
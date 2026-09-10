import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateSupplierProductV2, updateSupplierProductV2 } from "@/lib/supplierProductV2Sheets";
import type { UpdateSupplierProductV2Payload } from "@/types/supplier-product";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; const body = (await request.json()) as Partial<UpdateSupplierProductV2Payload>; return NextResponse.json(await updateSupplierProductV2({ ...body, supplierProductId: id }, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update supplier product." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; return NextResponse.json(await deactivateSupplierProductV2(id, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate supplier product." }, { status: 500 }); }
}

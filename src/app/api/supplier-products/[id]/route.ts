import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateSupplierProduct, updateSupplierProduct } from "@/lib/supplierProductSheets";
import type { UpdateSupplierProductPayload } from "@/types/supplier-product";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; const body = (await request.json()) as Partial<UpdateSupplierProductPayload>; return NextResponse.json(await updateSupplierProduct({ ...body, supplierProductId: id }, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update supplier product." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; return NextResponse.json(await deactivateSupplierProduct(id, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate supplier product." }, { status: 500 }); }
}
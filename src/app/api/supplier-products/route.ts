import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addSupplierProduct, getSupplierProducts } from "@/lib/supplierProductSheets";
import type { CreateSupplierProductPayload } from "@/types/supplier-product";

export async function GET(request: Request) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  const url = new URL(request.url);
  try { return NextResponse.json(await getSupplierProducts({ productId: url.searchParams.get("productId") || undefined, supplierId: url.searchParams.get("supplierId") || undefined, status: url.searchParams.get("status") || undefined })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch supplier products." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const body = (await request.json()) as CreateSupplierProductPayload; return NextResponse.json(await addSupplierProduct(body, session.userId), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create supplier product." }, { status: 500 }); }
}
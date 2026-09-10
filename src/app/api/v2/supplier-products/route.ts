import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addSupplierProductV2, getSupplierProductsV2 } from "@/lib/supplierProductV2Sheets";
import type { CreateSupplierProductV2Payload } from "@/types/supplier-product";

export async function GET(request: Request) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  const url = new URL(request.url);
  try { return NextResponse.json(await getSupplierProductsV2({ productId: url.searchParams.get("productId") || undefined, supplierId: url.searchParams.get("supplierId") || undefined, status: url.searchParams.get("status") || undefined })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch supplier products." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const body = (await request.json()) as CreateSupplierProductV2Payload; return NextResponse.json(await addSupplierProductV2(body, session.userId), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create supplier product." }, { status: 500 }); }
}

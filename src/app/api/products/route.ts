import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addProduct, getProducts } from "@/lib/productSheets";
import type { CreateProductRecordPayload } from "@/types/product-record";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try { return NextResponse.json(await getProducts()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch products." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as CreateProductRecordPayload;
    if (!body.productName?.trim() || !body.productCategoryId?.trim() || !body.unitId?.trim()) return NextResponse.json({ error: "Product name, category, and unit are required." }, { status: 400 });
    return NextResponse.json(await addProduct(body, session.userId), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create product." }, { status: 500 }); }
}
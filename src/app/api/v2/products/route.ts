import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addProductV2, getProductsV2 } from "@/lib/productV2Sheets";
import type { CreateProductV2Payload } from "@/types/product-v2";

export async function GET() {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { return NextResponse.json(await getProductsV2()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch V2 products." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as CreateProductV2Payload;
    if (!body.productName?.trim() || !body.productCategoryId?.trim() || !body.unitId?.trim()) return NextResponse.json({ error: "Product name, category, and unit are required." }, { status: 400 });
    return NextResponse.json(await addProductV2(body, session.userId), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create V2 product." }, { status: 500 }); }
}

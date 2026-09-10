import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addProductCategoryV2, getProductCategoriesV2 } from "@/lib/productReferenceV2Sheets";
import type { ProductCategoryV2 } from "@/types/product-reference-v2";
export async function GET() { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; return NextResponse.json(await getProductCategoriesV2()); }
export async function POST(request: Request) { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; try { const body = (await request.json()) as Omit<ProductCategoryV2, "productCategoryId">; return NextResponse.json(await addProductCategoryV2(body), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create category." }, { status: 500 }); } }

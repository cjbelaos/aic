import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addProductCategory, getProductCategories } from "@/lib/productReferenceSheets";
import type { ProductCategoryRecord } from "@/types/product-reference";
export async function GET() { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; return NextResponse.json(await getProductCategories()); }
export async function POST(request: Request) { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; try { const body = (await request.json()) as Omit<ProductCategoryRecord, "productCategoryId">; return NextResponse.json(await addProductCategory(body), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create category." }, { status: 500 }); } }
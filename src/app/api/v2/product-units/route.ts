import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addProductUnitV2, getProductUnitsV2 } from "@/lib/productReferenceV2Sheets";
import type { ProductUnitV2 } from "@/types/product-reference-v2";
export async function GET() { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; return NextResponse.json(await getProductUnitsV2()); }
export async function POST(request: Request) { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; try { const body = (await request.json()) as Omit<ProductUnitV2, "unitId">; return NextResponse.json(await addProductUnitV2(body), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create unit." }, { status: 500 }); } }

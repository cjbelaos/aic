import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addProductUnit, getProductUnits } from "@/lib/productReferenceSheets";
import type { ProductUnitRecord } from "@/types/product-reference";
export async function GET() { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; return NextResponse.json(await getProductUnits()); }
export async function POST(request: Request) { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; try { const body = (await request.json()) as Omit<ProductUnitRecord, "unitId">; return NextResponse.json(await addProductUnit(body), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create unit." }, { status: 500 }); } }
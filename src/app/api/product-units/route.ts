import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getProductUnits, addProductUnit } from "@/lib/productUnitSheets";
import { CreateProductUnitPayload } from "@/types/product-unit";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const units = await getProductUnits();
    return NextResponse.json(units, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch product units.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateProductUnitPayload = await request.json();
    const created = await addProductUnit(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create product.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

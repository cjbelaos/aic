import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getProducts, addProduct } from "@/lib/productSheets";
import { CreateProductPayload } from "@/types/product";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const products = await getProducts();
    return NextResponse.json(products, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch products.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateProductPayload = await request.json();
    const created = await addProduct(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create product.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

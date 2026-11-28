import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateProduct, updateProduct } from "@/lib/productSheets";
import { deactivateCustomerPrice, getCustomerPrices } from "@/lib/customerPriceSheets";
import { invalidateUsageCache } from "@/lib/productReplacement/service";
import type { UpdateProductRecordPayload } from "@/types/product-record";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; const body = (await request.json()) as Partial<UpdateProductRecordPayload>; return NextResponse.json(await updateProduct({ ...body, productId: id }, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update product." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try {
    const { id } = await params;
    const product = await deactivateProduct(id, session.userId);
    // A deleted product must not keep pricing customers: deactivate its active customer prices too.
    const prices = (await getCustomerPrices()).filter((price) => price.productId === id && price.status === "active");
    for (const price of prices) await deactivateCustomerPrice(price.customerProductPriceId, session.userId);
    invalidateUsageCache();
    return NextResponse.json(product);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate product." }, { status: 500 }); }
}
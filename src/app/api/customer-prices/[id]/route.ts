import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateCustomerPrice, updateCustomerPrice } from "@/lib/customerPriceSheets";
import type { UpdateCustomerPricePayload } from "@/types/customer-price";
import { getCompanies } from "@/lib/companySheets";
import { getProducts } from "@/lib/productSheets";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<UpdateCustomerPricePayload> & { companyName?: string; productCode?: string };
    const [companies, products] = await Promise.all([getCompanies(), getProducts()]);
    const customerId = body.customerId || (body.companyName ? companies.find((c) => c.companyName.trim().toLowerCase() === body.companyName?.trim().toLowerCase())?.companyId : undefined);
    const productId = body.productId || (body.productCode ? products.find((p) => p.productCode.trim().toLowerCase() === body.productCode?.trim().toLowerCase())?.productId : undefined);
    return NextResponse.json(await updateCustomerPrice({ ...body, customerId, productId, customerProductPriceId: id }, session.userId));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update customer price." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; return NextResponse.json(await deactivateCustomerPrice(id, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate customer price." }, { status: 500 }); }
}
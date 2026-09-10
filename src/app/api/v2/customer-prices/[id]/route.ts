import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { deactivateCustomerPriceV2, updateCustomerPriceV2 } from "@/lib/customerPriceV2Sheets";
import type { UpdateCustomerPriceV2Payload } from "@/types/customer-price-v2";
import { getCompanies } from "@/lib/companySheets";
import { getProductsV2 } from "@/lib/productV2Sheets";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<UpdateCustomerPriceV2Payload> & { companyName?: string; productCode?: string };
    const [companies, products] = await Promise.all([getCompanies(), getProductsV2()]);
    const customerId = body.customerId || (body.companyName ? companies.find((c) => c.companyName.trim().toLowerCase() === body.companyName?.trim().toLowerCase())?.companyId : undefined);
    const productId = body.productId || (body.productCode ? products.find((p) => p.productCode.trim().toLowerCase() === body.productCode?.trim().toLowerCase())?.productId : undefined);
    return NextResponse.json(await updateCustomerPriceV2({ ...body, customerId, productId, customerProductPriceId: id }, session.userId));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update V2 customer price." }, { status: 500 }); }
}
export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { const { id } = await params; return NextResponse.json(await deactivateCustomerPriceV2(id, session.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to deactivate V2 customer price." }, { status: 500 }); }
}

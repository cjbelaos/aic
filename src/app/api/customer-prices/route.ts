import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addCustomerPrice, getCustomerPrices } from "@/lib/customerPriceSheets";
import type { CreateCustomerPricePayload } from "@/types/customer-price";
import { getCompanies } from "@/lib/companySheets";
import { getProducts } from "@/lib/productSheets";

async function enrich() {
  const [prices, companies, products] = await Promise.all([getCustomerPrices(), getCompanies(), getProducts()]);
  return prices.map((price) => ({
    ...price,
    id: price.customerProductPriceId,
    companyId: price.customerId,
    companyName: companies.find((c) => c.companyId === price.customerId)?.companyName ?? price.customerId,
    productCode: products.find((p) => p.productId === price.productId)?.productCode ?? price.productId,
  }));
}
export async function GET() {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try { return NextResponse.json(await enrich()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch customer prices." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession(); if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as CreateCustomerPricePayload & { companyName?: string; productCode?: string };
    if (!body.customerId || !body.productId) {
      const [companies, products] = await Promise.all([getCompanies(), getProducts()]);
      body.customerId ||= companies.find((c) => c.companyName.trim().toLowerCase() === body.companyName?.trim().toLowerCase())?.companyId ?? "";
      body.productId ||= products.find((p) => p.productCode.trim().toLowerCase() === body.productCode?.trim().toLowerCase())?.productId ?? "";
    }
    const created = await addCustomerPrice({ customerId: body.customerId, productId: body.productId, customerProductName: body.customerProductName,
      pricePerUnit: body.pricePerUnit, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo, status: body.status ?? "active" }, session.userId);
    return NextResponse.json(created, { status: 201 });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create customer price." }, { status: 500 }); }
}
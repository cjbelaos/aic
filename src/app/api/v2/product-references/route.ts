import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getProductCategoriesV2, getProductUnitsV2 } from "@/lib/productReferenceV2Sheets";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const [categories, units] = await Promise.all([getProductCategoriesV2(), getProductUnitsV2()]);
    return NextResponse.json({ categories, units });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch V2 product references." }, { status: 500 });
  }
}

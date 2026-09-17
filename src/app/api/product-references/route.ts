import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getProductCategories, getProductUnits } from "@/lib/productReferenceSheets";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const [categories, units] = await Promise.all([getProductCategories(), getProductUnits()]);
    return NextResponse.json({ categories, units });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch product references." }, { status: 500 });
  }
}
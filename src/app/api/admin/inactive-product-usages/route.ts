import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { getInactiveProductUsages } from "@/lib/productReplacement/service";

export async function GET() {
  const session = await requireAdminSession(); if (session instanceof Response) return session;
  try { return NextResponse.json({ usages: await getInactiveProductUsages() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load inactive product usages." }, { status: 500 }); }
}

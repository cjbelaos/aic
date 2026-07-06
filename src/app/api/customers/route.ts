import { NextResponse } from "next/server";
import { getCustomers } from "@/lib/customerSheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const customers = await getCustomers();
    return NextResponse.json(customers, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch customers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

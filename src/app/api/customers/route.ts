import { NextResponse } from "next/server";
import { getCustomers, addCustomer } from "@/lib/customerSheets";
import { CreateCustomerPayload } from "@/types/customer";
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

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateCustomerPayload = await request.json();
    const created = await addCustomer(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create customer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getSuppliers, addSupplier } from "@/lib/supplierSheets";
import { CreateSupplierPayload } from "@/types/supplier";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const suppliers = await getSuppliers();
    return NextResponse.json(suppliers, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch suppliers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateSupplierPayload = await request.json();
    const created = await addSupplier(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create supplier.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

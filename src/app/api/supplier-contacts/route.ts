import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getSupplierContacts,
  addSupplierContact,
} from "@/lib/supplierContactSheets";
import { CreateSupplierContactPayload } from "@/types/supplierContact";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const contacts = await getSupplierContacts();
    return NextResponse.json(contacts, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch supplier contacts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateSupplierContactPayload = await request.json();
    const created = await addSupplierContact(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create supplier contact.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

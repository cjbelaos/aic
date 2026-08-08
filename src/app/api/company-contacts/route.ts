import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getCompanyContacts,
  addCompanyContact,
} from "@/lib/companyContactSheets";
import { CreateCompanyContactPayload } from "@/types/companyContact";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const contacts = await getCompanyContacts();
    return NextResponse.json(contacts, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch company contacts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateCompanyContactPayload = await request.json();
    const created = await addCompanyContact(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create company contact.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

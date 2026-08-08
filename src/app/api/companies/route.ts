import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getCompanies,
  addCompany,
  clearAllCompanies,
} from "@/lib/companySheets";
import { CreateCompanyPayload } from "@/types/company";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const companies = await getCompanies();
    return NextResponse.json(companies, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch companies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateCompanyPayload = await request.json();
    const created = await addCompany(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create company.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    await clearAllCompanies();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to clear companies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

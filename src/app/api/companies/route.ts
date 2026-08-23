import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getCompanies,
  addCompany,
  clearAllCompanies,
} from "@/lib/companySheets";
import { addCompanyContact } from "@/lib/companyContactSheets";
import { CreateCompanyPayload } from "@/types/company";
import { CreateCompanyContactPayload } from "@/types/companyContact";

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
    const body = (await request.json()) as CreateCompanyPayload & {
      contacts?: CreateCompanyContactPayload[];
    };
    const { contacts, ...companyPayload } = body;

    const created = await addCompany(companyPayload);

    // Create contacts if provided, linking them to the new companyId
    if (contacts && contacts.length > 0) {
      for (const contact of contacts) {
        await addCompanyContact({
          ...contact,
          companyId: created.companyId,
        });
      }
    }

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

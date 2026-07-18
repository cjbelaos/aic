import { NextResponse } from "next/server";
import { addQuotation, getQuotations } from "@/lib/quotationSheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { CreateQuotationPayload } from "@/types/quotation";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const quotations = await getQuotations();
    return NextResponse.json(quotations, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch quotations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateQuotationPayload = await request.json();
    const created = await addQuotation(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create quotation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

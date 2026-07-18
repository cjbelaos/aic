import { NextResponse } from "next/server";
import {
  getQuotationByRefNo,
  deleteQuotationByRefNo,
  updateQuotation,
} from "@/lib/quotationSheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { CreateQuotationPayload } from "@/types/quotation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ refNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { refNo } = await params;
    const quotation = await getQuotationByRefNo(refNo);
    if (!quotation) {
      return NextResponse.json(
        { error: "Quotation not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(quotation, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch quotation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ refNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { refNo } = await params;
    await deleteQuotationByRefNo(refNo);
    return NextResponse.json(
      { success: true, message: "Quotation deleted successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete quotation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ refNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { refNo } = await params;
    const body: CreateQuotationPayload = await request.json();
    const updated = await updateQuotation(refNo, body);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update quotation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

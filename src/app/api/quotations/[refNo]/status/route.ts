import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { updateQuotationStatus } from "@/lib/quotationSheets";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ refNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { refNo } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["DRAFT", "SENT"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be DRAFT or SENT." },
        { status: 400 },
      );
    }

    await updateQuotationStatus(refNo, status);

    return NextResponse.json(
      { success: true, message: `Status updated to ${status}` },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

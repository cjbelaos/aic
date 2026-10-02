import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { cancelAndCreateCorrectedServiceInvoice } from "@/lib/serviceInvoiceSheets";

export async function POST(request: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { invoiceNo } = await params;
    const body = await request.json();
    const replacementInvoiceNo = await cancelAndCreateCorrectedServiceInvoice(decodeURIComponent(invoiceNo).trim(), session.userId, body.reason);
    return NextResponse.json({ replacementInvoiceNo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create corrected copy.";
    return NextResponse.json({ error: message }, { status: /Only an unpaid|not found|reason is required|Resolve recorded payments/i.test(message) ? 400 : 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { cancelAndCreateCorrectedServiceInvoice } from "@/lib/serviceInvoiceSheets";

export async function POST(_request: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { invoiceNo } = await params;
    const replacementInvoiceNo = await cancelAndCreateCorrectedServiceInvoice(decodeURIComponent(invoiceNo).trim(), session.userId);
    return NextResponse.json({ replacementInvoiceNo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create corrected copy.";
    return NextResponse.json({ error: message }, { status: /Only an unpaid|not found/i.test(message) ? 400 : 500 });
  }
}

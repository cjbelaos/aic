import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  completeServiceInvoiceManually,
  getServiceInvoiceManualCompletionRecord,
  reverseManualServiceInvoiceCompletion,
} from "@/lib/serviceInvoiceSheets";


function isAdmin(roleId: number): boolean {
  return roleId === 1;
}

export async function POST(request: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { invoiceNo } = await params;
    const normalized = decodeURIComponent(invoiceNo).trim();
    const body = await request.json() as { completionDate?: string; technicianUserId?: string; notes?: string };
    const record = await getServiceInvoiceManualCompletionRecord(normalized);
    if (!isAdmin(session.userRoleId) && record.assignedTechnicianUserId !== session.userId) {
      return NextResponse.json({ error: "Only an admin or the assigned service technician can record manual service completion." }, { status: 403 });
    }
    await completeServiceInvoiceManually(normalized, {
      completionDate: String(body.completionDate ?? "").trim(),
      technicianUserId: String(body.technicianUserId ?? "").trim(),
      notes: String(body.notes ?? "").trim(),
    }, { userId: session.userId, displayName: session.fullName }, isAdmin(session.userRoleId));
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete service manually.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!isAdmin(session.userRoleId)) return NextResponse.json({ error: "Only an admin can reverse manual service completion." }, { status: 403 });
  try {
    const { invoiceNo } = await params;
    const body = await request.json() as { reversalDate?: string; notes?: string };
    const reversalDate = String(body.reversalDate ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    if (!reversalDate || !notes) return NextResponse.json({ error: "Reversal date and notes are required." }, { status: 400 });
    await reverseManualServiceInvoiceCompletion(decodeURIComponent(invoiceNo).trim(), reversalDate, notes, { userId: session.userId, displayName: session.fullName });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reverse manual completion.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

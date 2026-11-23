import { NextResponse } from "next/server";
import { isAdminUser, requireAuthenticatedSession } from "@/lib/auth/session";
import { syncServiceInvoicesToTracker } from "@/lib/serviceInvoiceTracker/sync";

/** Admin catch-up: copy every Service Invoice from 1801 onward to the accounting tracker. */
export async function POST() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!isAdminUser(session)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    return NextResponse.json(await syncServiceInvoicesToTracker(), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync the accounting tracker.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

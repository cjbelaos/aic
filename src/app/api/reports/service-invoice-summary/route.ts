import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { getServiceInvoices } from "@/lib/serviceInvoiceSheets";
import { buildServiceInvoiceSummaryReport, type ReportPeriod } from "@/lib/serviceInvoiceSummary";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "today";
  if (!["today", "week", "month", "custom"].includes(period)) return NextResponse.json({ error: "Invalid report period." }, { status: 400 });
  try {
    const report = buildServiceInvoiceSummaryReport(await getServiceInvoices(), period as ReportPeriod, url.searchParams.get("start") || undefined, url.searchParams.get("end") || undefined);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load report.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Select a valid") ? 400 : 500 });
  }
}

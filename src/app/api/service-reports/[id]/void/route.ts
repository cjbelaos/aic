import { NextResponse } from "next/server";
import { voidReport } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseVoidReportInput } from "@/lib/serviceReports/validation";
import { reportContext } from "../../route";
import { syncServiceInvoiceReportLink } from "@/lib/serviceInvoiceSheets";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const input = parseVoidReportInput(body);
    const report = await voidReport(reportContext(), auth.actor, id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
    });
    void syncServiceInvoiceReportLink(report.serviceInvoiceNo, report.serviceReportId, report.status).catch(() => {});
    return NextResponse.json({ success: true, report }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
import { NextResponse } from "next/server";
import { generatePdfRetry } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseExpectedVersionInput } from "@/lib/serviceReports/validation";
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
    const input = parseExpectedVersionInput(body);
    const result = await generatePdfRetry(reportContext(), auth.actor, id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
    });
    if (result.report.serviceInvoiceNo) void syncServiceInvoiceReportLink(result.report.serviceInvoiceNo, result.report.serviceReportId, result.report.status).catch(() => {});
    return NextResponse.json(
      { success: true, report: result.report, reused: result.reused },
      { status: 200 },
    );
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}

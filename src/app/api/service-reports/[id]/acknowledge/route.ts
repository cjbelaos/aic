import { NextResponse } from "next/server";
import { acknowledge } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseAcknowledgeMultipart } from "@/lib/serviceReports/validation";
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
    const formData = await request.formData();
    const input = await parseAcknowledgeMultipart(formData);
    const result = await acknowledge(reportContext(), auth.actor, id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      acknowledgedByFullName: input.acknowledgedByFullName,
      acknowledgedByPosition: input.acknowledgedByPosition,
      consentConfirmed: input.consentConfirmed,
      signaturePng: input.signaturePng,
    });
    void syncServiceInvoiceReportLink(result.report.serviceInvoiceNo, result.report.serviceReportId, result.report.status).catch(() => {});
    return NextResponse.json(
      {
        success: true,
        report: result.report,
        pdfReady: result.pdfReady,
        pdfWarning: result.pdfWarning,
        reused: result.reused,
      },
      { status: 200 },
    );
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
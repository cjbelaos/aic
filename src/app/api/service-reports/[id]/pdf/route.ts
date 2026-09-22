import { NextResponse } from "next/server";
import { generatePdfRetry, getReportDetail } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseExpectedVersionInput } from "@/lib/serviceReports/validation";
import { reportContext } from "../../route";
import { syncServiceInvoiceReportLink } from "@/lib/serviceInvoiceSheets";

/** Streams a private final report PDF after the standard report access check. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const detail = await getReportDetail(reportContext(), auth.actor, id);
    const report = detail.report;
    if (!report.pdfDriveFileId || report.pdfGenerationStatus !== "READY") {
      return NextResponse.json(
        { code: "PDF_NOT_READY", message: "The final PDF is not available yet." },
        { status: 404 },
      );
    }

    const pdf = Buffer.from(await reportContext().drive.fetchFileBase64(report.pdfDriveFileId), "base64");
    const filename = `${report.serviceReportNo || "service-report"}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}

/** Regenerates a failed PDF; the existing mutation contract remains unchanged. */
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

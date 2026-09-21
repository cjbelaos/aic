import { NextResponse } from "next/server";
import {
  createOperationContext,
  createOrOpenReport,
  listReportsForActor,
} from "@/lib/serviceReports/service";
import { createSheetsServiceReportStore } from "@/lib/serviceReports/store";
import { createServiceReportDrive } from "@/lib/serviceReports/drive";
import { renderServiceReportPdf } from "@/lib/serviceReports/pdf";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseCreateReportInput } from "@/lib/serviceReports/validation";
import { syncServiceInvoiceReportLink } from "@/lib/serviceInvoiceSheets";

let cachedContext: ReturnType<typeof createOperationContext> | undefined;

/** Lazy per-process context so missing Drive env fails per-request (503), not at import. */
export function reportContext() {
  if (!cachedContext) {
    cachedContext = createOperationContext(
      createSheetsServiceReportStore(),
      createServiceReportDrive(),
      { pdfRenderer: renderServiceReportPdf },
    );
  }
  return cachedContext;
}

export async function GET() {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const rows = await listReportsForActor(reportContext(), auth.actor);
    return NextResponse.json({ success: true, rows }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const input = parseCreateReportInput(body);
    const result = await createOrOpenReport(reportContext(), auth.actor, {
      commandId: input.commandId,
      invoiceNo: input.invoiceNo,
      reportType: input.reportType,
    });
    // Keep the ServiceInvoices Q:R link fresh (best-effort; never blocks the response).
    void syncServiceInvoiceReportLink(result.report.serviceInvoiceNo, result.report.serviceReportId, result.report.status).catch(() => {});
    return NextResponse.json(
      { success: true, report: result.report, invoice: result.invoice, reusedExisting: result.reusedExisting },
      { status: 201 },
    );
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
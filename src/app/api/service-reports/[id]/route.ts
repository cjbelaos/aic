import { NextResponse } from "next/server";
import {
  getReportDetail,
  saveDraft,
} from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseSaveDraftInput } from "@/lib/serviceReports/validation";
import { reportContext } from "../route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const detail = await getReportDetail(reportContext(), auth.actor, id);
    return NextResponse.json({ success: true, ...detail }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    // PATCH is discriminated by the STORED report type (never by query params).
    const stored = await reportContext().store.getReport(id);
    if (!stored) {
      return NextResponse.json({ code: "NOT_FOUND", message: `Service Report ${id} was not found.` }, { status: 404 });
    }
    const input = parseSaveDraftInput(body, stored.reportType);
    if (input.reportType === "WATER_TREATMENT") {
      const wt = input.waterTreatment;
      const report = await saveDraft(reportContext(), auth.actor, id, {
        reportType: "WATER_TREATMENT",
        waterTreatment: {
          commandId: wt.commandId,
          expectedVersion: wt.expectedVersion,
          serviceDate: wt.serviceDate,
          serviceType: wt.serviceType,
          clientName: wt.clientName,
          clientAddress: wt.clientAddress,
          details: wt.waterTreatmentDetails,
        },
      });
      return NextResponse.json({ success: true, report }, { status: 200 });
    }
    const g = input.general;
    const report = await saveDraft(reportContext(), auth.actor, id, {
      reportType: "GENERAL",
      general: {
        commandId: g.commandId,
        expectedVersion: g.expectedVersion,
        serviceDate: g.serviceDate,
        serviceType: g.serviceType,
        fieldReport: g.fieldReport,
        remarks: g.remarks,
        clientAddress: g.clientAddress,
      },
    });
    return NextResponse.json({ success: true, report }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
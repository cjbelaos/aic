import { NextResponse } from "next/server";
import { changeReportType } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseChangeReportTypeInput } from "@/lib/serviceReports/validation";
import { reportContext } from "../../route";

/** Corrects a report type only while the server-side report is still a draft. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseChangeReportTypeInput(await request.json());
    const report = await changeReportType(reportContext(), auth.actor, id, input);
    return NextResponse.json({ success: true, report }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}

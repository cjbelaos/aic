import { NextResponse } from "next/server";
import { getReportHistory } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { reportContext } from "../../route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const history = await getReportHistory(reportContext(), auth.actor, id);
    return NextResponse.json({ success: true, history }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
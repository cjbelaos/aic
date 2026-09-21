import { NextResponse } from "next/server";
import { markReady } from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { parseExpectedVersionInput } from "@/lib/serviceReports/validation";
import { reportContext } from "../../route";

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
    const report = await markReady(reportContext(), auth.actor, id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
    });
    return NextResponse.json({ success: true, report }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
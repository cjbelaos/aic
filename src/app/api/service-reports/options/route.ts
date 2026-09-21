import { NextResponse } from "next/server";
import {
  getReportOptions,
} from "@/lib/serviceReports/service";
import {
  requireReportActor,
  serviceReportErrorResponse,
} from "@/lib/serviceReports/http-helpers";
import { reportContext } from "../route";
import { getUsers } from "@/lib/userSheets";

export async function GET() {
  const auth = await requireReportActor();
  if (auth.response) return auth.response;
  try {
    const result = await getReportOptions(reportContext(), auth.actor);
    // Only identity fields are exposed — never password hashes.
    const users = (await getUsers()).map((user) => ({
      userId: user.userId,
      username: user.username,
      fullName: user.fullName,
    }));
    return NextResponse.json({ success: true, invoices: result.invoices, users }, { status: 200 });
  } catch (error) {
    return serviceReportErrorResponse(error);
  }
}
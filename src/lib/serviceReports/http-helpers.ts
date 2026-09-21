// Auth/authorization + error mapping shared by the Service Report API routes.

import { requireAuthenticatedSession } from "@/lib/auth/session";
import { ServiceReportError } from "./errors";
import type { ReportActor } from "./permissions";

export function toActor(session: { userId: string; userRoleId: number; fullName: string }): ReportActor {
  return { userId: session.userId, userRoleId: session.userRoleId, fullName: session.fullName };
}

export type ReportAuthResult =
  | { actor: ReportActor; response?: undefined }
  | { actor?: undefined; response: Response };

export async function requireReportActor(): Promise<ReportAuthResult> {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return { response: session };
  return { actor: toActor(session) };
}

export function serviceReportErrorResponse(error: unknown): Response {
  if (error instanceof ServiceReportError) {
    return Response.json(error.toBody(), { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected Service Report error.";
  return Response.json({ code: "INTERNAL", message }, { status: 500 });
}
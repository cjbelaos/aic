// Auth/authorization + error mapping shared by the Sales Order API routes.

import { requireAuthenticatedSession } from "@/lib/auth/session";
import { can, type SalesCapability } from "./permissions.ts";
import { SalesOrderError } from "./errors.ts";

export interface SessionLite {
  userId: string;
  username: string;
  fullName: string;
  userRoleId: number;
  departmentId: number;
}

export type SalesAuthResult =
  | { session: SessionLite; response?: undefined }
  | { session?: undefined; response: Response };

export async function requireSalesPermission(
  capability: SalesCapability,
  extras: { assignedToUserId?: string; orderStatus?: string } = {},
): Promise<SalesAuthResult> {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return { response: session };
  const decision = can(capability, {
    roleId: session.userRoleId,
    actorUserId: session.userId,
    assignedToUserId: extras.assignedToUserId,
    orderStatus: extras.orderStatus,
  });
  if (!decision.allowed) {
    return {
      response: Response.json(
        { code: "FORBIDDEN", message: decision.reason ?? "Forbidden. You do not have permission for this Sales Order action." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export function salesErrorResponse(error: unknown): Response {
  if (error instanceof SalesOrderError) {
    return Response.json(error.toBody(), { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected sales-order error.";
  return Response.json({ code: "INTERNAL", message }, { status: 500 });
}

export function toActor(session: { userId: string; fullName: string }): { userId: string; displayName: string } {
  return { userId: session.userId, displayName: session.fullName };
}
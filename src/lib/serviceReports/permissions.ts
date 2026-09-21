// Service Reports — object-level authorization. Server-owned: every mutation
// and read route calls these checks. Roles: the assigned technician (resolved
// from the authoritative Service Invoice assignment) and ADMINS (userRoleId 1).
// Other authenticated users are denied with an explicit message.

import type { ServiceReport, ServiceInvoiceCoarseRow } from "../../types/serviceReport.ts";

export interface ReportActor {
  userId: string;
  userRoleId: number;
  fullName: string;
}

export const SERVICE_REPORT_ADMIN_ROLE_ID = 1;

export function isServiceReportAdmin(actor: ReportActor): boolean {
  return actor.userRoleId === SERVICE_REPORT_ADMIN_ROLE_ID;
}

export interface ReportDecision {
  allowed: boolean;
  reason?: string;
}

function assignedTechnicianId(
  report: ServiceReport | null,
  invoice: ServiceInvoiceCoarseRow | null,
): string {
  if (invoice?.assignedTechnicianUserId) return invoice.assignedTechnicianUserId;
  return report?.assignedTechnicianUserId ?? "";
}

export function canAccessReport(
  actor: ReportActor,
  report: ServiceReport | null,
  invoice: ServiceInvoiceCoarseRow | null,
): ReportDecision {
  if (isServiceReportAdmin(actor)) return { allowed: true };
  const assignedId = assignedTechnicianId(report, invoice);
  if (assignedId && assignedId === actor.userId) return { allowed: true };
  return {
    allowed: false,
    reason: "Only the assigned technician or an admin may access this Service Report.",
  };
}

export function canModifyReport(
  actor: ReportActor,
  report: ServiceReport,
  invoice: ServiceInvoiceCoarseRow | null,
): ReportDecision {
  const access = canAccessReport(actor, report, invoice);
  if (!access.allowed) return access;
  if (report.status !== "DRAFT") {
    return {
      allowed: false,
      reason: `This report is ${report.status} and cannot be edited anymore.`,
    };
  }
  return { allowed: true };
}

export function canAdministerReport(actor: ReportActor): ReportDecision {
  if (isServiceReportAdmin(actor)) return { allowed: true };
  return { allowed: false, reason: "Admin access is required for this Service Report action." };
}
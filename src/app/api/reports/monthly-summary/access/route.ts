import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { canAccessProfitReports } from "@/lib/profitReportAccess";

/**
 * GET /api/reports/monthly-summary/access
 *
 * Client-side gate for the Monthly Profit Summary page. The same rule is
 * enforced server-side by the report endpoint itself.
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  return NextResponse.json({
    canAccess: await canAccessProfitReports(session),
  });
}

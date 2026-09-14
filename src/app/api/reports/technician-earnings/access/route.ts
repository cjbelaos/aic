import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { canAccessTechnicianEarnings } from "@/lib/technicianEarningsAccess";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  return NextResponse.json({
    canAccess: await canAccessTechnicianEarnings(session),
  });
}

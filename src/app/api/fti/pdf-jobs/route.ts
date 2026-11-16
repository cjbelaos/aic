import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { canManageFuelPrice } from "@/lib/technicianEarningsAccess";
import { processFTIPdfJobs } from "@/lib/ftiPdfJobs";
import { FTIWriteConflict } from "@/lib/ftiWriteLock";

export const maxDuration = 60;

async function run() {
  try { return NextResponse.json(await processFTIPdfJobs()); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF retry failed." }, { status: error instanceof FTIWriteConflict ? 409 : 500 });
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

export async function POST() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!(await canManageFuelPrice(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return run();
}

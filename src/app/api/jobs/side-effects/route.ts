import { NextRequest, NextResponse } from "next/server";
import { isAdminUser, requireAuthenticatedSession } from "@/lib/auth/session";
import { isPostgresBackend } from "@/lib/db/postgres";
import { runPendingSideEffects, type SideEffectJob } from "@/lib/db/outbox";

/**
 * Runs pending Google side effects recorded by PostgreSQL saves (plan 2026-11-28 Task 8).
 * GET: Vercel cron with `Authorization: Bearer $CRON_SECRET`. POST: an admin, on demand.
 *
 * DR PDFs carry the browser-rendered file; uploading needs the staging Drive destinations from the
 * follow-on plan. Until those exist the job fails on purpose and stays pending with a clear error,
 * so nothing is lost and nothing is written to the live Drive or workbook.
 */
async function uploadDrPdf(job: SideEffectJob): Promise<void> {
  void job;
  throw new Error("DR PDF upload on PostgreSQL needs the staging Drive destinations (follow-on plan); the job stays pending.");
}

async function run() {
  if (!isPostgresBackend()) return NextResponse.json({ error: "Side-effect jobs exist only on the PostgreSQL backend." }, { status: 409 });
  const pdf = await runPendingSideEffects("dr.pdf", uploadDrPdf);
  return NextResponse.json({ "dr.pdf": pdf });
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
  if (!isAdminUser(session)) return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
  return run();
}

import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getBacklog } from "@/lib/contractReleases/source";

/** Customers owed contract releases, most overdue first. */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    return NextResponse.json(await getBacklog());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load the release backlog.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
export async function POST() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  return NextResponse.json({ error: "Upload the scanned physical Service Invoice instead." }, { status: 410 });
}

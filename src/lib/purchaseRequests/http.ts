import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import type { SessionUser } from "@/types/user";

/** Shared wrapper for purchase request routes: session and error mapping. */
export async function prRoute(work: (session: SessionUser) => Promise<unknown>, status = 200): Promise<Response> {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    return NextResponse.json(await work(session), { status });
  } catch (error) {
    const known = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : "Purchase request failed.";
    if (known && known >= 400 && known < 500) return NextResponse.json({ error: message }, { status: known });
    console.error("Purchase request failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try { return (await request.json()) as T; } catch { return {} as T; }
}

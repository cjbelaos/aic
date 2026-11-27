import { NextResponse } from "next/server";
import { inTransaction, isPostgresBackend } from "@/lib/db/postgres";
import { IdempotencyConflictError, withIdempotency } from "@/lib/db/idempotency";

/** Carries a handler's error response out of the transaction so it rolls back and is not stored. */
class RolledBackResponse extends Error {
  constructor(readonly response: Response) { super("rolled back"); }
}

/**
 * Runs a mutating route handler. On Sheets it just runs. On PostgreSQL the whole handler is one
 * transaction stamped with the signed-in user, made safe to retry by the request's `requestId`:
 * a repeated request gets the first response, a reused id with a different payload gets 409.
 * Any error response (4xx/5xx) rolls everything back and is not remembered, so a corrected retry runs.
 */
export async function runSave(
  actor: string,
  scope: string,
  payload: Record<string, unknown> | undefined,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!isPostgresBackend()) return handler();
  const { requestId, ...content } = payload ?? {};
  try {
    const stored = await inTransaction(actor, () => withIdempotency(typeof requestId === "string" ? requestId : undefined, scope, content, async () => {
      const response = await handler();
      if (response.status >= 400) throw new RolledBackResponse(response);
      return { status: response.status, body: await response.json().catch(() => null) };
    }));
    return NextResponse.json(stored.body, { status: stored.status });
  } catch (error) {
    if (error instanceof RolledBackResponse) return error.response;
    if (error instanceof IdempotencyConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error(`${scope} failed:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The save failed." }, { status: 500 });
  }
}

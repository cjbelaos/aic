import { createHash } from "node:crypto";
import { currentActor, txQuery } from "@/lib/db/postgres";

/** A request id reused for a different save (HTTP 409). */
export class IdempotencyConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("This request ID was already used for a different save.");
    this.name = "IdempotencyConflictError";
  }
}

const sorted = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(sorted)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Record<string, unknown>)[key])]))
      : value;

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(sorted(payload ?? null))).digest("hex");
}

/**
 * Makes a save safe to retry. Must run inside inTransaction. The first request
 * with `requestId` runs `work` and stores its result in the same transaction; a
 * retry with the same scope, actor and payload gets that stored result without
 * running `work` again. A concurrent duplicate waits for the first to commit
 * (the primary key holds it) and then replays. If `work` fails, nothing is
 * stored, so the retry runs normally. Without a request id, `work` just runs.
 */
export async function withIdempotency<T>(requestId: string | undefined, scope: string, payload: unknown, work: () => Promise<T>): Promise<T> {
  if (!requestId) return work();
  const actor = currentActor() ?? "";
  const hash = payloadHash(payload);
  const claimed = await txQuery<{ request_id: string }>(
    `insert into aic.request_log (request_id, scope, actor, payload_sha256, result)
     values ($1, $2, $3, $4, 'null'::jsonb) on conflict (request_id) do nothing returning request_id`,
    [requestId, scope, actor, hash],
  );
  if (!claimed.length) {
    const [prior] = await txQuery<{ scope: string; actor: string; payload_sha256: string; result: T }>(
      "select scope, actor, payload_sha256, result from aic.request_log where request_id = $1",
      [requestId],
    );
    if (!prior || prior.scope !== scope || prior.actor !== actor || prior.payload_sha256 !== hash) throw new IdempotencyConflictError();
    return prior.result;
  }
  const result = await work();
  await txQuery("update aic.request_log set result = $2 where request_id = $1", [requestId, JSON.stringify(result ?? null)]);
  return result;
}

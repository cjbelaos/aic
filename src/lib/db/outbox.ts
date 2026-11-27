import { inTransaction, txQuery } from "@/lib/db/postgres";

/** Google work that follows a save. "test.outbox" is reserved for tests. */
export type SideEffectKind = "dr.pdf" | "si.pdf" | "quotation.pdf" | "tracker.sync" | "test.outbox";

export type SideEffectJob = { id: number; kind: SideEffectKind; document_key: string; payload: Record<string, unknown>; attempts: number };

/**
 * Records follow-up work for a document in the current transaction, so it
 * exists only if the save commits. While a job for the same document is still
 * pending, it is reused and given the latest payload (one export per document).
 */
export async function enqueueSideEffect(kind: SideEffectKind, documentKey: string, payload: Record<string, unknown>): Promise<string> {
  const [row] = await txQuery<{ id: string }>(
    `insert into aic.outbox (kind, document_key, payload) values ($1, $2, $3)
     on conflict (kind, document_key) where status = 'pending' do update set payload = excluded.payload
     returning id::text`,
    [kind, documentKey, JSON.stringify(payload)],
  );
  return row.id;
}

/**
 * Runs due pending jobs of one kind, each in its own transaction. Jobs are
 * claimed with SKIP LOCKED, so parallel runners never take the same job. A
 * failing handler leaves its job pending, with the attempt counted, the error
 * kept and the next attempt delayed (2, 4, 8 … up to 60 minutes).
 */
export async function runPendingSideEffects(
  kind: SideEffectKind,
  handler: (job: SideEffectJob) => Promise<void>,
  limit = 10,
): Promise<{ done: number; failed: number }> {
  const outcome = { done: 0, failed: 0 };
  for (let i = 0; i < limit; i++) {
    const handled = await inTransaction(`system:outbox:${kind}`, async () => {
      const [job] = await txQuery<SideEffectJob>(
        `select id, kind, document_key, payload, attempts from aic.outbox
         where kind = $1 and status = 'pending' and next_attempt_at <= now()
         order by id for update skip locked limit 1`,
        [kind],
      );
      if (!job) return false;
      try {
        await handler(job);
        await txQuery("update aic.outbox set status = 'done', attempts = attempts + 1, last_error = null where id = $1", [job.id]);
        outcome.done++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await txQuery(
          `update aic.outbox set attempts = attempts + 1, last_error = left($2, 1000),
             next_attempt_at = now() + least(power(2, attempts + 1), 60) * interval '1 minute' where id = $1`,
          [job.id, message],
        );
        outcome.failed++;
      }
      return true;
    });
    if (!handled) break;
  }
  return outcome;
}

// Stand-ins for the PostgreSQL modules when a Sheets-path test stubs every unknown "@/…" import.
// They keep modules on the Sheets path (isPostgresBackend() is false) instead of crashing on import.
const sql = () => "''";
const refuse = () => { throw new Error('PostgreSQL is not available in a Sheets-path test.'); };
const SHEETS_MODE_STUBS = {
  '@/lib/db/postgres': { isPostgresBackend: () => false, currentActor: () => undefined, dbQuery: refuse, txQuery: refuse, inTransaction: refuse, withTransaction: refuse, pgErrorCode: () => undefined },
  '@/lib/db/sheetRows': { col: sql, iso: sql, bool: sql, ref: sql, sheetRows: refuse, sheetRowsByHeaders: refuse, sheetRowsForRange: refuse },
  '@/lib/db/sequences': { nextDrNumber: refuse },
  '@/lib/db/outbox': { enqueueSideEffect: refuse, runPendingSideEffects: refuse },
  '@/lib/db/idempotency': { withIdempotency: (_id, _scope, _payload, work) => work(), IdempotencyConflictError: class extends Error {} },
};
module.exports = { SHEETS_MODE_STUBS };

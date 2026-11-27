import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";

/**
 * PostgreSQL access for the Supabase migration (plan §4). Modules switch from
 * Google Sheets to PostgreSQL when DATA_BACKEND=postgres; production stays on
 * Sheets until cutover. DATABASE_URL is the app login role (aic_web) through
 * the Supabase transaction pooler. Server-only: never import from a client
 * component.
 */
export function isPostgresBackend(): boolean {
  return process.env.DATA_BACKEND === "postgres";
}

const globalForPool = globalThis as typeof globalThis & { __aicPgPool?: Pool };

function pool(): Pool {
  if (!globalForPool.__aicPgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    globalForPool.__aicPgPool = new Pool({
      connectionString,
      // Supabase's pooler presents its own CA; the connection is still encrypted.
      ssl: { rejectUnauthorized: false },
      // Serverless functions each hold a few connections; the pooler multiplexes them.
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return globalForPool.__aicPgPool;
}

/** Runs a read query and returns its rows. */
export async function dbQuery<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(sql, params)).rows;
}

type OpenTransaction = { client: PoolClient; actor: string; depth: number };
const transactions = new AsyncLocalStorage<OpenTransaction>();

/**
 * Runs `work` in one transaction stamped with the acting user, so the audit
 * trigger fills created_by/updated_by (writes without an actor are rejected by
 * the database). Every module write made inside `work` through txQuery joins
 * this transaction, so a save spanning several modules commits or rolls back
 * as one. Called while a transaction is already open, it joins it as a
 * savepoint: its own failure undoes only its own writes, and the outer actor
 * stays in effect.
 */
export async function inTransaction<T>(actor: string, work: () => Promise<T>): Promise<T> {
  const open = transactions.getStore();
  if (open) {
    const savepoint = `sp_${open.depth + 1}`;
    await open.client.query(`savepoint ${savepoint}`);
    try {
      const result = await transactions.run({ ...open, depth: open.depth + 1 }, work);
      await open.client.query(`release savepoint ${savepoint}`);
      return result;
    } catch (error) {
      await open.client.query(`rollback to savepoint ${savepoint}`).catch(() => {});
      throw error;
    }
  }
  if (!actor.trim()) throw new Error("A database write needs the acting user.");
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('aic.actor', $1, true)", [actor]);
    const result = await transactions.run({ client, actor, depth: 0 }, work);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Runs a statement in the current transaction (see inTransaction). */
export async function txQuery<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  const open = transactions.getStore();
  if (!open) throw new Error("No database transaction is open.");
  return (await open.client.query<T>(sql, params)).rows;
}

/** The acting user of the open transaction, if any. */
export function currentActor(): string | undefined {
  return transactions.getStore()?.actor;
}

/** inTransaction with direct access to the client, for single-statement writes. */
export async function withTransaction<T>(actor: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(actor, () => work(transactions.getStore()!.client));
}

/** Postgres error code, e.g. 23505 unique_violation or 23503 foreign_key_violation. */
export function pgErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

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

/**
 * Runs `work` in one transaction stamped with the acting user, so the audit
 * trigger fills created_by/updated_by. Writes without an actor are rejected by
 * the database itself. Any error rolls the whole transaction back.
 */
export async function withTransaction<T>(actor: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!actor.trim()) throw new Error("A database write needs the acting user.");
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('aic.actor', $1, true)", [actor]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Postgres error code, e.g. 23505 unique_violation or 23503 foreign_key_violation. */
export function pgErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

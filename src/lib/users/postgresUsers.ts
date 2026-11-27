import { dbQuery, pgErrorCode, withTransaction } from "@/lib/db/postgres";
import { getSession } from "@/lib/auth/session";
import type { User } from "@/types/user";

/**
 * Users storage in PostgreSQL (aic.users). Business rules (validation,
 * password hashing, duplicate checks) stay in userSheets.ts; this module only
 * reads and writes rows, keeping the Sheets-era value formats the app expects.
 */

type UserRow = {
  user_id: string; username: string; full_name: string | null; email: string | null;
  password_hash: string | null; salt: string | null; user_role_id: number | null;
  department_id: number | null; position_id: number | null; created_at: Date | null;
  last_login: Date | null; signature: string | null; requires_approval: string | null;
  contact_number: string | null;
};

const COLUMNS = "user_id, username, full_name, email, password_hash, salt, user_role_id, department_id, position_id, created_at, last_login, signature, requires_approval, contact_number";

/** Sheets stored these as "YYYY-MM-DD HH:MM:SS" (UTC). */
function sheetTimestamp(value: Date | null): string {
  return value ? value.toISOString().replace("T", " ").slice(0, 19) : "";
}

/** Same rule as the Users!M cell: only explicit NO/FALSE/0/N exempt a user. */
function requiresApproval(value: string | null): boolean {
  const v = (value ?? "").trim().toUpperCase();
  return !(v === "NO" || v === "FALSE" || v === "0" || v === "N");
}

function toUser(row: UserRow): User {
  return {
    userId: row.user_id.trim(),
    username: row.username.trim(),
    fullName: (row.full_name ?? "").trim(),
    email: (row.email ?? "").trim(),
    passwordHash: (row.password_hash ?? "").trim(),
    salt: (row.salt ?? "").trim(),
    userRoleId: row.user_role_id ?? 2,
    departmentId: row.department_id ?? 0,
    positionId: row.position_id ?? 0,
    createdAt: sheetTimestamp(row.created_at),
    lastLogin: sheetTimestamp(row.last_login),
    signature: (row.signature ?? "").trim() || undefined,
    requiresApproval: requiresApproval(row.requires_approval),
    contactNumber: (row.contact_number ?? "").trim(),
  };
}

/** Lookup ids of 0 mean "none" in the app but are foreign keys here. */
const ref = (id: number) => (id > 0 ? id : null);

async function actor(): Promise<string> {
  const session = await getSession();
  if (!session?.userId) throw new Error("Sign in again to make this change.");
  return session.userId;
}

export async function listUsers(): Promise<User[]> {
  const rows = await dbQuery<UserRow>(
    `select ${COLUMNS} from aic.users where btrim(coalesce(username, '')) <> '' order by source_row nulls last, created_at, user_id`,
  );
  return rows.map(toUser);
}

export async function insertUser(user: User): Promise<void> {
  try {
    await withTransaction(await actor(), (client) => client.query(
      `insert into aic.users (user_id, username, full_name, email, password_hash, salt, user_role_id, department_id, position_id, signature, requires_approval, contact_number)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [user.userId, user.username, user.fullName, user.email, user.passwordHash, user.salt, user.userRoleId,
        ref(user.departmentId), ref(user.positionId), user.signature || null, user.requiresApproval ? "YES" : "NO", user.contactNumber || null],
    ));
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new Error("Username already exists.");
    throw error;
  }
}

export async function saveUser(user: User): Promise<void> {
  try {
    const result = await withTransaction(await actor(), (client) => client.query(
      `update aic.users set username = $2, full_name = $3, email = $4, password_hash = $5, salt = $6, user_role_id = $7,
         department_id = $8, position_id = $9, signature = $10, requires_approval = $11, contact_number = $12
       where user_id = $1`,
      [user.userId, user.username, user.fullName, user.email, user.passwordHash, user.salt, user.userRoleId,
        ref(user.departmentId), ref(user.positionId), user.signature || null, user.requiresApproval ? "YES" : "NO", user.contactNumber || null],
    ));
    if (result.rowCount === 0) throw new Error(`User not found with ID: ${user.userId}`);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new Error("Username already exists.");
    throw error;
  }
}

export async function removeUser(id: string): Promise<void> {
  try {
    const result = await withTransaction(await actor(), (client) => client.query("delete from aic.users where user_id = $1", [id]));
    if (result.rowCount === 0) throw new Error(`User not found with ID: ${id}`);
  } catch (error) {
    if (pgErrorCode(error) === "23503") {
      throw new Error("This user has FTIs, liquidations, attendance or approver assignments, so they can't be deleted.");
    }
    throw error;
  }
}

/** Called during sign-in, before a session exists: the user is their own actor. */
export async function touchLastLogin(id: string): Promise<void> {
  await withTransaction(id, (client) => client.query("update aic.users set last_login = now() where user_id = $1", [id]));
}

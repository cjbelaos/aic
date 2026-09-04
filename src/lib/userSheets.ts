import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { generateSalt, hashPassword } from "@/lib/password";
import type {
  CreateUserInput,
  PublicUser,
  UpdateUserInput,
  User,
} from "@/types/user";

const USERS_SHEET = "Users";
// A=userId, B=username, C=fullName, D=email, E=passwordHash, F=salt,
// G=userRoleId, H=departmentId, I=positionId, J=createdAt, K=lastLogin,
// L=signature, M=requiresApproval (YES/NO, empty ⇒ YES)
const USERS_RANGE = `${USERS_SHEET}!A2:M`;

// ── Simple TTL Cache ──────────────────────────
// getUsers()/getUserById()/getUserByUsername() are called on hot paths
// (e.g. FTI list loads run getFTIRequestFull per row), and every call used
// to hit the Users sheet. Caching here collapses the N+1 pattern into 1 read.
const USERS_CACHE_TTL_MS = 10_000;
let usersCache:
  | { users: User[]; rows: string[][]; expires: number }
  | undefined;

function invalidateUsersCache(): void {
  usersCache = undefined;
}

function getCachedUsers(): { users: User[]; rows: string[][] } | undefined {
  if (!usersCache) return undefined;
  if (Date.now() > usersCache.expires) {
    usersCache = undefined;
    return undefined;
  }
  return { users: usersCache.users, rows: usersCache.rows };
}

function setCachedUsers(users: User[], rows: string[][]): void {
  usersCache = { users, rows, expires: Date.now() + USERS_CACHE_TTL_MS };
}

async function getUsersSpreadsheetId(): Promise<string> {
  return await getDatabaseSpreadsheetId();
}

/**
 * Parses a string into a numeric userRoleId.
 * Supports both numeric strings and "admin"/"user" literals for backward compat.
 */
function parseUserRoleId(value: string): number {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "admin") return 1;
  if (trimmed === "user") return 2;
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? 2 : num;
}

function parseNumericId(value: string): number {
  const num = parseInt(value.trim(), 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parses the Users!M (requiresApproval) cell. Empty/unknown values default to
 * true so pre-existing users keep requiring approval (backward compatible).
 * Only explicit NO/FALSE/0/N are treated as exempt.
 */
function parseRequiresApproval(value: string): boolean {
  const v = (value || "").trim().toUpperCase();
  return !(v === "NO" || v === "FALSE" || v === "0" || v === "N");
}

/**
 * Maps our Google Sheets row position indices straight into runtime objects
 */
function rowToUser(row: string[], rowNumber: number): User | null {
  const username = (row[1] || "").trim();
  if (!username) return null;

  return {
    userId: (row[0] || "").trim(), // A
    username, // B
    fullName: (row[2] || "").trim(), // C
    email: (row[3] || "").trim(), // D
    passwordHash: (row[4] || "").trim(), // E
    salt: (row[5] || "").trim(), // F
    userRoleId: parseUserRoleId(row[6] || "2"), // G
    departmentId: parseNumericId(row[7] || "0"), // H
    positionId: parseNumericId(row[8] || "0"), // I
    createdAt: (row[9] || "").trim(), // J
    lastLogin: (row[10] || "").trim(), // K
    signature: (row[11] || "").trim() || undefined, // L
    requiresApproval: parseRequiresApproval(row[12] || ""), // M
  };
}

/**
 * Maps user objects to sheet row data (13 columns, A-M).
 */
function userToRow(user: User): string[] {
  return [
    user.userId, // A
    user.username, // B
    user.fullName, // C
    user.email, // D
    user.passwordHash, // E
    user.salt, // F
    String(user.userRoleId), // G
    String(user.departmentId || ""), // H
    String(user.positionId || ""), // I
    user.createdAt, // J
    user.lastLogin, // K
    user.signature || "", // L
    user.requiresApproval ? "YES" : "NO", // M
  ];
}

export function toPublicUser(user: User): PublicUser {
  return {
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    userRoleId: user.userRoleId,
    departmentId: user.departmentId,
    positionId: user.positionId,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    signature: user.signature,
    requiresApproval: user.requiresApproval,
  };
}

/**
 * Looks up the sheet row number (1-based, including header) for a given UUID.
 */
async function getRowByUuid(uuid: string): Promise<number> {
  const spreadsheetId = await getUsersSpreadsheetId();
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: USERS_RANGE,
  });

  const rows = response.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || "").trim() === uuid) {
      return i + 2;
    }
  }
  throw new Error(`User not found with ID: ${uuid}`);
}

async function fetchUserRows(): Promise<{ users: User[]; rows: string[][] }> {
  const cached = getCachedUsers();
  if (cached) return cached;

  const spreadsheetId = await getUsersSpreadsheetId();
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: USERS_RANGE,
  });

  const rows = response.data.values || [];
  const users = rows
    .map((row, index) => rowToUser(row, index + 2))
    .filter((user): user is User => user !== null);

  setCachedUsers(users, rows);
  return { users, rows };
}

export async function getUsers(): Promise<PublicUser[]> {
  const { users } = await fetchUserRows();
  return users.map(toPublicUser);
}

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const { users } = await fetchUserRows();
  const normalized = username.trim().toLowerCase();
  return (
    users.find((user) => user.username.toLowerCase() === normalized) ?? null
  );
}

export async function getUserById(id: string): Promise<User | null> {
  const { users } = await fetchUserRows();
  return users.find((user) => user.userId === id) ?? null;
}

export async function addUser(input: CreateUserInput): Promise<PublicUser> {
  const spreadsheetId = await getUsersSpreadsheetId();

  const username = input.username.trim();
  const fullName = input.fullName?.trim() || username;
  const email = input.email.trim();
  const userRoleId = input.userRoleId;

  if (!username) {
    throw new Error("Username is required.");
  }
  if (!input.password || input.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    throw new Error("Username already exists.");
  }

  const salt = generateSalt();
  const user: User = {
    userId: crypto.randomUUID(),
    username,
    fullName,
    email,
    passwordHash: hashPassword(input.password, salt),
    salt,
    userRoleId,
    departmentId: input.departmentId || 0,
    positionId: input.positionId || 0,
    createdAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    lastLogin: "",
    requiresApproval: input.requiresApproval ?? true,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${USERS_SHEET}!A:M`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [userToRow(user)] },
  });

  invalidateUsersCache();
  return toPublicUser(user);
}

export async function updateUser(
  id: string,
  updatedData: UpdateUserInput,
): Promise<PublicUser> {
  const spreadsheetId = await getUsersSpreadsheetId();

  const rowNumber = await getRowByUuid(id);
  const current = await getUserById(id);
  if (!current) {
    throw new Error("User not found.");
  }

  if (
    updatedData.username &&
    updatedData.username.trim().toLowerCase() !== current.username.toLowerCase()
  ) {
    const duplicate = await getUserByUsername(updatedData.username);
    if (duplicate && duplicate.userId !== id) {
      throw new Error("Username already exists.");
    }
  }

  let passwordHash = current.passwordHash;
  let salt = current.salt;

  if (updatedData.password) {
    if (updatedData.password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    salt = generateSalt();
    passwordHash = hashPassword(updatedData.password, salt);
  }

  const updated: User = {
    ...current,
    username: updatedData.username?.trim() || current.username,
    fullName: updatedData.fullName?.trim() || current.fullName,
    email:
      updatedData.email !== undefined
        ? updatedData.email.trim()
        : current.email,
    userRoleId:
      updatedData.userRoleId !== undefined
        ? updatedData.userRoleId
        : current.userRoleId,
    departmentId:
      updatedData.departmentId !== undefined
        ? updatedData.departmentId
        : current.departmentId,
    positionId:
      updatedData.positionId !== undefined
        ? updatedData.positionId
        : current.positionId,
    passwordHash,
    salt,
    signature:
      updatedData.signature !== undefined
        ? updatedData.signature
        : current.signature,
    requiresApproval:
      updatedData.requiresApproval !== undefined
        ? updatedData.requiresApproval
        : current.requiresApproval,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${USERS_SHEET}!A${rowNumber}:M${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [userToRow(updated)] },
  });

  invalidateUsersCache();
  return toPublicUser(updated);
}

export async function deleteUser(id: string): Promise<void> {
  const spreadsheetId = await getUsersSpreadsheetId();
  const rowNumber = await getRowByUuid(id);

  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const sheet = spreadsheet.data.sheets?.find(
    (entry) => entry.properties?.title === USERS_SHEET,
  );
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId === undefined) {
    throw new Error(`Sheet "${USERS_SHEET}" not found.`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });

  invalidateUsersCache();
}

export async function updateLastLogin(id: string): Promise<void> {
  const spreadsheetId = await getUsersSpreadsheetId();
  const rowNumber = await getRowByUuid(id);
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${USERS_SHEET}!K${rowNumber}`, // Column K = lastLogin
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[new Date().toISOString().replace("T", " ").slice(0, 19)]],
    },
  });

  invalidateUsersCache();
}
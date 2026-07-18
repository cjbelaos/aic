import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { generateSalt, hashPassword } from "@/lib/password";
import type {
  CreateUserInput,
  PublicUser,
  UpdateUserInput,
  User,
  UserRole,
} from "@/types/user";

const USERS_SHEET = "Users";
const USERS_RANGE = `${USERS_SHEET}!A2:I`; // Covers columns A to I (signature added)

async function getUsersSpreadsheetId(): Promise<string> {
  return await getDatabaseSpreadsheetId();
}

function normalizeRole(value: string): UserRole {
  return value.trim().toLowerCase() === "admin" ? "admin" : "user";
}

/**
 * Maps our Google Sheets row position indices straight into runtime objects
 */
function rowToUser(row: string[], rowNumber: number): User | null {
  const username = (row[0] || "").trim();
  if (!username) return null;

  return {
    id: `usr_${rowNumber}`, // Clean sequential ID matching its spreadsheet line entry directly
    username,
    fullName: (row[1] || "").trim(),
    email: (row[2] || "").trim(),
    passwordHash: (row[3] || "").trim(),
    salt: (row[4] || "").trim(),
    role: normalizeRole(row[5] || "user"),
    createdAt: (row[6] || "").trim(),
    lastLogin: (row[7] || "").trim(),
    signature: (row[8] || "").trim() || undefined,
  };
}

/**
 * Maps structural configurations straight into targeted row data formats.
 * Notice: We exclude tracking row IDs inside columns to respect your sheet setup.
 */
function userToRow(user: User): string[] {
  return [
    user.username,
    user.fullName,
    user.email,
    user.passwordHash,
    user.salt,
    user.role,
    user.createdAt,
    user.lastLogin,
    user.signature || "",
  ];
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    signature: user.signature,
  };
}

/**
 * Extracts raw sheet row sequence values out of user ID string tags safely.
 * Example: "usr_4" -> 4
 */
function getRowFromId(id: string): number {
  const rowStr = id.replace("usr_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid User ID format: ${id}`);
  }
  return rowNum;
}

async function fetchUserRows(): Promise<{ users: User[]; rows: string[][] }> {
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
  return users.find((user) => user.id === id) ?? null;
}

export async function addUser(input: CreateUserInput): Promise<PublicUser> {
  const spreadsheetId = await getUsersSpreadsheetId();

  const username = input.username.trim();
  // Safe validation fallback: if fullName is empty, default it to the username clean tag
  const fullName = input.fullName?.trim() || username;
  const email = input.email.trim();
  const role = normalizeRole(input.role);

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

  const { rows } = await fetchUserRows();
  const nextRowNumber = rows.length + 2;

  const salt = generateSalt();
  const user: User = {
    id: `usr_${nextRowNumber}`,
    username,
    fullName,
    email,
    passwordHash: hashPassword(input.password, salt),
    salt,
    role,
    createdAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    lastLogin: "",
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${USERS_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [userToRow(user)] },
  });

  return toPublicUser(user);
}

export async function updateUser(
  id: string,
  updatedData: UpdateUserInput,
): Promise<PublicUser> {
  const spreadsheetId = await getUsersSpreadsheetId();

  const rowNumber = getRowFromId(id);
  const current = await getUserById(id);
  if (!current) {
    throw new Error("User not found.");
  }

  if (
    updatedData.username &&
    updatedData.username.trim().toLowerCase() !== current.username.toLowerCase()
  ) {
    const duplicate = await getUserByUsername(updatedData.username);
    if (duplicate && duplicate.id !== id) {
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
    role: updatedData.role ? normalizeRole(updatedData.role) : current.role,
    passwordHash,
    salt,
    signature:
      updatedData.signature !== undefined
        ? updatedData.signature
        : current.signature,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${USERS_SHEET}!A${rowNumber}:I${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [userToRow(updated)] },
  });

  return toPublicUser(updated);
}

export async function deleteUser(id: string): Promise<void> {
  const spreadsheetId = await getUsersSpreadsheetId();
  const rowNumber = getRowFromId(id);

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
}

export async function updateLastLogin(id: string): Promise<void> {
  const spreadsheetId = await getUsersSpreadsheetId();
  const rowNumber = getRowFromId(id);
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${USERS_SHEET}!H${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[new Date().toISOString().replace("T", " ").slice(0, 19)]],
    },
  });
}

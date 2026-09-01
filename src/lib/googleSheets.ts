import { google, sheets_v4, drive_v3 } from "googleapis";
import { readFileSync } from "fs";

/** Service-account email for this project's Google Sheets/Drive access. */
const SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  "aic-service-account@aic-nextjs-sheets-db-501208.iam.gserviceaccount.com";

/**
 * Shared Auth client builder used by all Google API wrappers.
 *
 * PREFERRED: Service Account (JWT) — never expires, no refresh token,
 * no `invalid_grant`. Uses GOOGLE_SERVICE_ACCOUNT_KEY (raw service-account
 * JSON, see .env.local) or GOOGLE_PRIVATE_KEY + GOOGLE_SERVICE_ACCOUNT_EMAIL.
 * The service account must be granted Editor access on the database
 * spreadsheet and the Drive folders used for uploads.
 *
 * FALLBACK: OAuth2 refresh-token flow (original behavior).
 */
export async function createOAuth2Client() {
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const saEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || SERVICE_ACCOUNT_EMAIL;
  const saPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const saKeyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (saKeyFile) {
    return buildJWTFromFile(saKeyFile, saEmail);
  }

  if (saKey) {
    try {
      const parsed = JSON.parse(saKey) as {
        client_email: string;
        private_key: string;
      };
      return new google.auth.JWT({
        email: parsed.client_email,
        key: parsed.private_key.replace(/\\n/g, "\n"),
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive.file",
        ],
      });
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON.");
    }
  }

  if (saEmail && saPrivateKey) {
    return new google.auth.JWT({
      email: saEmail,
      key: saPrivateKey.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
  }

  // ── Fallback: OAuth2 refresh token ──
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables.",
    );
  }
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Missing GOOGLE_REFRESH_TOKEN environment variable.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

/** Reads a PEM or service-account JSON file and returns a JWT auth client. */
function buildJWTFromFile(filePath: string, fallbackEmail: string) {
  const raw = readFileSync(filePath, "utf8").trim();
  const scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ];
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key: string;
    };
    return new google.auth.JWT({
      email: parsed.client_email || fallbackEmail,
      key: parsed.private_key.replace(/\\n/g, "\n"),
      scopes,
    });
  }
  return new google.auth.JWT({ email: fallbackEmail, key: raw, scopes });
}

/**
 * Creates an OAuth2 auth client with Sheets-only scope.
 */
export async function getSheetsClient() {
  const auth = await createOAuth2Client();
  return google.sheets({ version: "v4", auth });
}

/**
 * Creates an OAuth2 auth client with BOTH Sheets and Drive scopes.
 */
export async function getSheetsAndDriveClient(): Promise<{
  sheets: sheets_v4.Sheets;
  drive: drive_v3.Drive;
}> {
  const auth = await createOAuth2Client();
  return {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
  };
}

/**
 * Creates a Drive client backed by the OAuth2 refresh-token flow.
 *
 * IMPORTANT: Service accounts have NO storage quota, so `drive.files.create`
 * fails with "Service Accounts do not have storage quota". File uploads must
 * act as a real user. This client always uses GOOGLE_CLIENT_ID/SECRET/
 * GOOGLE_REFRESH_TOKEN (the pre-service-account credentials) so created files
 * consume the user's Drive quota.
 */
export async function getDriveUploadClient(): Promise<drive_v3.Drive> {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REFRESH_TOKEN
  ) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN environment variables (required for Drive uploads).",
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Month folder names matching the existing Google Drive convention:
 * "<N>. <MONTH>" e.g. "8. AUGUST", "9. SEPTEMBER", "10. OCTOBER".
 * Indexed by Date.getMonth() (0 = January → "1. JANUARY").
 */
export const MONTH_NAMES = [
  "1. JANUARY",
  "2. FEBRUARY",
  "3. MARCH",
  "4. APRIL",
  "5. MAY",
  "6. JUNE",
  "7. JULY",
  "8. AUGUST",
  "9. SEPTEMBER",
  "10. OCTOBER",
  "11. NOVEMBER",
  "12. DECEMBER",
];

/**
 * Escapes a value for use inside a single-quoted Google Drive API `q` query
 * literal. A bare single quote would terminate the string and cause the API
 * to reject the query with "Invalid Value"; escaping it with a backslash keeps
 * the literal intact.
 */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

/**
 * Walks a two-level year/month folder hierarchy under `parentId`. Creates
 * missing folders along the way and returns the leaf (month) folder ID.
 *
 * @param drive   Authenticated Drive client (must have write permission).
 * @param parentId  Google Drive folder ID of the parent (e.g. "DELIVERY RECEIPT").
 * @param year      Four-digit year string, e.g. "2026".
 * @param monthName Full English month name, e.g. "September".
 * @returns The Drive file ID of the month folder.
 */
export async function resolveDriveFolderPath(
  drive: drive_v3.Drive,
  parentId: string,
  year: string,
  monthName: string,
): Promise<string> {
  async function findOrCreateFolder(
    name: string,
    parent: string,
  ): Promise<string> {
    // Search for existing folder by name under the given parent.
    const list = await drive.files.list({
      q: `'${parent}' in parents and name = '${escapeDriveQueryValue(name)}' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
    });
    if (list.data.files && list.data.files.length > 0) {
      return list.data.files[0].id!;
    }
    // Not found — create it.
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parent],
      },
      supportsAllDrives: true,
    });
    return created.data.id!;
  }

  const yearFolderId = await findOrCreateFolder(year, parentId);
  return findOrCreateFolder(monthName, yearFolderId);
}

export async function getDatabaseSpreadsheetId(): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID_DATABASE environment variable.");
  }
  return spreadsheetId;
}

export async function getFTISpreadsheetId(): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_FTI;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID_FTI environment variable.");
  }
  return spreadsheetId;
}

/** Spreadsheet for the new schedule-first workflow (3 tabs). */
export async function getNewFlowSpreadsheetId(): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_NEWFLOW;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID_NEWFLOW environment variable.");
  }
  return spreadsheetId;
}

/**
 * Obtains an OAuth access token suitable for fetching the Sheets export URL
 * (e.g. https://docs.google.com/spreadsheets/d/{id}/export?format=pdf) server-side.
 */
export async function getAccessTokenForFetch(): Promise<string> {
  const client = await createOAuth2Client();
  const result = await client.getAccessToken();
  const token = typeof result === "string" ? result : (result?.token ?? null);
  if (!token) {
    throw new Error("Failed to obtain access token for Google Sheets export.");
  }
  return token;
}

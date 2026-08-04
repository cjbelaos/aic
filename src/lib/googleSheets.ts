import { google, sheets_v4, drive_v3 } from "googleapis";

/**
 * Shared OAuth2 client builder used by all Google API wrappers.
 * Uses GOOGLE_REFRESH_TOKEN from environment variables.
 */
export async function createOAuth2Client() {
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

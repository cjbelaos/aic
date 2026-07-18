import { google, sheets_v4, drive_v3 } from "googleapis";

/**
 * Shared OAuth2 client builder used by all Google API wrappers.
 * Extracted to a single function so callers can reuse the same auth client
 * for things like PDF export requests that need bearer tokens.
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

  // Automatically listen for token updates
  oauth2Client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      console.log("Got a new refresh token from Google:", tokens.refresh_token);
      // OPTIONAL: If you use a database to store configuration,
      // you would write code here to save tokens.refresh_token to it.
    }
    console.log("Access token refreshed automatically:", tokens.access_token);
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

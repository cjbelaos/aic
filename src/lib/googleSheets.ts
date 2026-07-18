import { google, sheets_v4, drive_v3 } from "googleapis";
import * as fs from "fs";
import * as path from "path";

/**
 * Persist a new refresh token to .env.local so it survives server restarts.
 * Google may rotate refresh tokens under certain conditions.
 */
function persistRefreshToken(newToken: string): void {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    let content = fs.readFileSync(envPath, "utf-8");
    const regex = /^GOOGLE_REFRESH_TOKEN=.*$/m;
    const replacement = `GOOGLE_REFRESH_TOKEN="${newToken}"`;
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
    } else {
      content += `\n${replacement}\n`;
    }
    fs.writeFileSync(envPath, content, "utf-8");
    // Also update the running process env so current session uses it
    process.env.GOOGLE_REFRESH_TOKEN = newToken;
    console.log("Persisted new refresh token to .env.local");
  } catch (err) {
    console.warn("Failed to persist refresh token to .env.local:", err);
  }
}

/**
 * Shared OAuth2 client builder used by all Google API wrappers.
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

  // Auto-persist new refresh tokens to .env.local when Google rotates them
  oauth2Client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      persistRefreshToken(tokens.refresh_token);
    }
    if (tokens.access_token) {
      console.log("Access token refreshed successfully.");
    }
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

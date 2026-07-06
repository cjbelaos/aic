import { google } from "googleapis";

export async function getSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL environment variable.",
    );
  }
  if (!process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Missing GOOGLE_PRIVATE_KEY environment variable.");
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export async function getDatabaseSpreadsheetId(): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID_DATABASE environment variable.");
  }
  return spreadsheetId;
}

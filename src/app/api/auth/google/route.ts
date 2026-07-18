import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

// Initialize the OAuth2 client using your environment variables
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:3000/api/auth/google`, // This URL must match your Google Console Redirect URI exactly
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Step 1: If there is no code, redirect the user to Google's Auth screen
  if (!code) {
    const scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Crucial: This guarantees you get a refresh_token
      prompt: "consent", // Crucial: Forces Google to show the consent screen so a new refresh token is issued
      scope: scopes,
    });

    return NextResponse.redirect(authUrl);
  }

  // Step 2: If the code is present, exchange it for the tokens
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // This will output your new tokens directly onto the browser screen
    return NextResponse.json({
      message: "Authentication successful!",
      refresh_token: tokens.refresh_token,
      full_tokens: tokens,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

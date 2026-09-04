import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
];

/**
 * GET /api/auth/google-token
 *
 * Session-less OAuth2 "refresh token" generator, reachable ONLY from the
 * login page (see components/auth/google-token-panel.tsx). Unlike the legacy
 * /api/auth/google route it:
 *   - derives the redirect URI from the request origin (works on localhost
 *     AND Vercel, no hardcoded URL),
 *   - returns the token to the opener via postMessage instead of dumping it
 *     in the browser.
 *
 * A token is only ever issued after the operator approves the Google consent
 * screen with their own account, so a random visitor cannot mint one.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Local development utility only — refuse on Vercel/deployed.
  const hostname = request.nextUrl.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (!isLocal) {
    return NextResponse.json(
      {
        error:
          "This utility is only available on local development (localhost).",
      },
      { status: 403 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google-token`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  // Step 1: No code — return the auth URL (JSON)
  if (!code) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // guarantees you get a refresh_token
      prompt: "consent", // forces a new refresh token each time (invalidates old one)
      scope: SCOPES,
    });

    return NextResponse.json({ authUrl });
  }

  // Step 2: Exchange code for tokens, return HTML with postMessage
  try {
    const { tokens } = await oauth2Client.getToken(code);

    const payload = tokens.refresh_token
      ? JSON.stringify({
          type: "GOOGLE_TOKEN",
          refresh_token: tokens.refresh_token,
        })
      : JSON.stringify({
          type: "GOOGLE_TOKEN",
          error:
            "No refresh token returned. Approve all scopes again on the consent screen.",
        });

    const html = `<!DOCTYPE html>
<html><head><title>Authorization Complete</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">
<p style="color:#374151">Authorization complete — you may close this window.</p>
<script>
try { window.opener.postMessage(${payload}, "${origin.replace(
      /\"/g,
      '\\\\"',
    )}"); } catch(e) {}
window.close();
</script>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";

    const html = `<!DOCTYPE html>
<html><head><title>Authorization Failed</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2">
<p style="color:#991b1b">Authorization failed: ${errorMessage.replace(
    /\"/g,
    "&quot;",
  ).replace(/</g, "&lt;")}</p>
<script>
try { window.opener.postMessage({ type: "GOOGLE_TOKEN", error: ${JSON.stringify(
    errorMessage,
  )} }, "${origin.replace(/\"/g, '\\\\"')}"); } catch(e) {}
window.close();
</script>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  }
}
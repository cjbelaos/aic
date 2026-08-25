import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/admin/google-token`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  // Step 1: No code — return the auth URL (JSON)
  if (!code) {
    const scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
    });

    return NextResponse.json({ authUrl });
  }

  // Step 2: Exchange code for tokens, return HTML with postMessage
  try {
    const { tokens } = await oauth2Client.getToken(code);

    const payload = tokens.refresh_token
      ? JSON.stringify({ type: "GOOGLE_TOKEN", refresh_token: tokens.refresh_token })
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
try { window.opener.postMessage(${payload}, "${origin.replace(/"/g, '\\"')}"); } catch(e) {}
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
<p style="color:#991b1b">Authorization failed: ${errorMessage.replace(/"/g, "&quot;").replace(/</g, "&lt;")}</p>
<script>
try { window.opener.postMessage({ type: "GOOGLE_TOKEN", error: ${JSON.stringify(errorMessage)} }, "${origin.replace(/"/g, '\\"')}"); } catch(e) {}
window.close();
</script>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  }
}
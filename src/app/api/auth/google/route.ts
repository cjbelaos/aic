import { NextResponse } from "next/server";

/**
 * Deprecated — superseded by /api/auth/google-token, which is reachable ONLY
 * from the login page and ONLY on localhost (see
 * components/auth/google-token-panel.tsx).
 *
 * This legacy route dumped raw OAuth tokens straight into the browser and
 * hardcoded http://localhost:3000 as its redirect URI, so it could never work
 * on Vercel and exposed tokens outside the login page.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: "This legacy OAuth endpoint has been removed.",
      message:
        "To regenerate a Google refresh token, open the login page on localhost and expand \u201cGoogle Token (troubleshooting)\u201d.",
    },
    { status: 410 },
  );
}

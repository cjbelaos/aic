#!/usr/bin/env node
/**
 * Regenerate a Google OAuth refresh token when the app hits `invalid_grant`.
 * Usage:
 *   node scripts/generate-google-token.mjs          → prints auth URL
 *   node scripts/generate-google-token.mjs <CODE>   → prints new GOOGLE_REFRESH_TOKEN
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (reads .env.local).
 * Long-term fix: publish the OAuth consent screen (Testing → Production),
 * otherwise refresh tokens expire every ~7 days in Testing mode.
 */
import { readFileSync } from "node:fs";

// ── Load .env.local (no dotenv dependency) ──
try {
  const envFile = readFileSync(".env.local", "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch {}

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error(
    "ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env.local",
  );
  process.exit(1);
}

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  process.argv[3] ||
  "http://localhost:3000/api/auth/google";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const code = process.argv[2];

if (!code) {
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    });
  console.log(
    "\nOpen this URL, approve, then copy the `code` from the address bar:\n",
  );
  console.log("  " + url + "\n");
  console.log("Then run:  node scripts/generate-google-token.mjs <CODE>\n");
  process.exit(0);
}

// ── Exchange the authorization code for tokens ──
const body = new URLSearchParams({
  code,
  client_id: GOOGLE_CLIENT_ID,
  client_secret: GOOGLE_CLIENT_SECRET,
  redirect_uri: REDIRECT_URI,
  grant_type: "authorization_code",
});

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});
const tokens = await res.json();

if (tokens.error || !tokens.refresh_token) {
  console.error(
    "ERROR:",
    tokens.error_description || tokens.error || "No refresh_token returned.",
  );
  console.error(
    "If no refresh_token: revoke app access at https://myaccount.google.com/permissions and retry.",
  );
  process.exit(1);
}

console.log("\n✅ Add this to .env.local (replacing the old value):\n");
console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");

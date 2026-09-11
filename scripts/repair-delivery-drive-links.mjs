import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const APPLY = process.argv.includes("--apply");
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") };
    const parsed = JSON.parse(raw); return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const file = readFileSync(keyFile, "utf8").trim();
    if (file.startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file };
    const parsed = JSON.parse(file); return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  throw new Error("Configure service-account credentials before running the repair.");
}

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "DeliveryReceipts!A2:L" });
const rows = response.data.values ?? [];

const affected = rows.flatMap((row, index) => {
  const statusCell = String(row[10] ?? "").trim();
  if (!/^https:\/\/drive\.google\.com\//i.test(statusCell)) return [];
  return [{ rowNumber: index + 2, drNumber: String(row[0] ?? "").trim(), misplacedLink: statusCell, existingLink: String(row[11] ?? "").trim() }];
});

console.log(JSON.stringify({ mode: APPLY ? "apply" : "audit-only", affectedCount: affected.length, affected: affected.map(({ rowNumber, drNumber, existingLink }) => ({ rowNumber, drNumber, hasExistingColumnLLink: Boolean(existingLink) })) }, null, 2));
if (!APPLY) process.exit(0);

const conflicts = affected.filter((entry) => entry.existingLink && entry.existingLink !== entry.misplacedLink);
if (conflicts.length) throw new Error(`Repair stopped: ${conflicts.length} row(s) already contain a different link in column L.`);
if (affected.length) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: affected.map((entry) => ({ range: `DeliveryReceipts!K${entry.rowNumber}:L${entry.rowNumber}`, values: [["printed", entry.misplacedLink]] })),
    },
  });
}
console.log(JSON.stringify({ ok: true, repairedCount: affected.length }, null, 2));

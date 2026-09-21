// ServiceReports ReportType backfill (idempotent, non-destructive).
//
// Historical rows created before ReportType was populated are blank; the
// application resolves a blank type as GENERAL for backward compatibility. This
// script only writes the literal GENERAL into blank ReportType cells. The target
// column is resolved from the LIVE header row (canonical schema: ReportType is
// column C) and the script aborts if the header row does not match — a reordered
// sheet must never make this script write into another column. It never changes a
// populated value, never writes outside that one column, and never reorders or
// renames columns.
//
// Preview (read-only):
//   node --env-file=.env.local scripts/backfill-service-report-types.mjs
// Apply:
//   node --env-file=.env.local scripts/backfill-service-report-types.mjs --apply

import { google } from "googleapis";

const TAB = "ServiceReports";
const DEFAULT_TYPE = "GENERAL";
const REPORT_TYPE_HEADER = "ReportType";
/** 0-based index the live header row must place ReportType at (column C). */
const TYPE_COLUMN_INDEX = 2;
const HEADER_RANGE = `${TAB}!A1:AH1`;
const RANGE = `${TAB}!A2:AH`;

/** 0-based column index -> A1 letter (2 -> "C"). */
function columnLetter(index) {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

async function createSheetsClient() {
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "aic-service-account@aic-nextjs-sheets-db-501208.iam.gserviceaccount.com";
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  let jwt;
  if (saKey) {
    const trimmed = saKey.trim();
    if (trimmed.startsWith("-----BEGIN")) jwt = new google.auth.JWT({ email: saEmail, key: trimmed.replace(/\\n/g, "\n"), scopes });
    else {
      const parsed = JSON.parse(trimmed);
      jwt = new google.auth.JWT({ email: parsed.client_email || saEmail, key: parsed.private_key.replace(/\\n/g, "\n"), scopes });
    }
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    jwt = new google.auth.JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), scopes });
  }
  if (!jwt) throw new Error("No Google credentials found (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_PRIVATE_KEY).");
  return google.sheets({ version: "v4", auth: jwt });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE environment variable.");
  const sheets = await createSheetsClient();

  // Resolve the ReportType column from the live header row. Never guess: writing
  // GENERAL into a reordered sheet's column C would corrupt another field.
  const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: HEADER_RANGE });
  const headers = (headerResponse.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
  const resolved = headers.indexOf(REPORT_TYPE_HEADER);
  if (resolved < 0) {
    throw new Error(`"${REPORT_TYPE_HEADER}" was not found in ${HEADER_RANGE}. Run scripts/verify-service-report-schema.mjs before backfilling.`);
  }
  if (resolved !== TYPE_COLUMN_INDEX) {
    throw new Error(`"${REPORT_TYPE_HEADER}" is in column ${columnLetter(resolved)} but the canonical ServiceReports schema puts it in column ${columnLetter(TYPE_COLUMN_INDEX)}. Provision the headers before backfilling.`);
  }
  const typeColumnLetter = columnLetter(resolved);

  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  const rows = response.data.values ?? [];
  const targets = [];
  rows.forEach((row, index) => {
    const reportId = String(row[0] ?? "").trim();
    if (!reportId) return;
    const currentType = String(row[resolved] ?? "").trim();
    if (currentType) return; // idempotent: never touch a populated type
    targets.push(index + 2); // data row index + 2 = spreadsheet row
  });

  console.log(`Scanned ${rows.length} ServiceReports row(s). Blank ReportType: ${targets.length}.`);
  if (targets.length === 0) {
    console.log("Nothing to backfill. No changes were made.");
    return;
  }
  if (!apply) {
    console.log(`Would write ${DEFAULT_TYPE} to ${typeColumnLetter} on rows: ${targets.join(", ")}`);
    console.log("Re-run with --apply to perform the backfill.");
    return;
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: targets.map((rowNumber) => ({
        range: `${TAB}!${typeColumnLetter}${rowNumber}`,
        values: [[DEFAULT_TYPE]],
      })),
    },
  });
  console.log(`Backfilled ${DEFAULT_TYPE} into ${targets.length} row(s): ${targets.join(", ")}`);
}

main().catch((error) => {
  console.error("Backfill failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

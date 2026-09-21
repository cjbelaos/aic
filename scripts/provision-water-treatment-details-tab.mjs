// Provision the WaterTreatmentServiceReportDetails tab (idempotent, additive).
//
// The Service Report module requires this tab (89 columns; row 1 = headers;
// ServiceReportId is both the primary key and the foreign key to
// ServiceReports). This script ONLY creates the tab when it is missing and writes
// row 1 from the domain contract in src/lib/serviceReports/constants.ts. It never
// writes another row, never edits another tab, and never deletes anything.
//
// Preview (read-only):
//   node --env-file=.env.local scripts/provision-water-treatment-details-tab.mjs
// Apply (creates the tab and/or fills row 1):
//   node --env-file=.env.local scripts/provision-water-treatment-details-tab.mjs --apply

import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const TAB = "WaterTreatmentServiceReportDetails";
const CONSTANTS_FILE = "src/lib/serviceReports/constants.ts";
const EXPECTED_WIDTH = 89;

/** 0-based column index -> A1 letter (88 -> "CK"). */
function columnLetter(index) {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/** Headers come from the TypeScript contract so there is only one source of truth. */
function headersFromContract() {
  const source = readFileSync(CONSTANTS_FILE, "utf8");
  const block = /export const WATER_TREATMENT_DETAILS_HEADERS: readonly string\[\] = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) throw new Error(`Could not find WATER_TREATMENT_DETAILS_HEADERS in ${CONSTANTS_FILE}.`);
  const headers = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (headers.length !== EXPECTED_WIDTH) {
    throw new Error(`Contract has ${headers.length} Water Treatment headers; expected ${EXPECTED_WIDTH}.`);
  }
  if (new Set(headers).size !== EXPECTED_WIDTH) {
    throw new Error("Contract header names must be unique.");
  }
  return headers;
}

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") };
    const parsed = JSON.parse(raw);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const file = readFileSync(keyFile, "utf8").trim();
    if (file.startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file };
    const parsed = JSON.parse(file);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  throw new Error("No Google credentials found (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_PRIVATE_KEY).");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE environment variable.");

  const headers = headersFromContract();
  const lastColumn = columnLetter(headers.length - 1);
  console.log(`Contract: ${headers.length} columns (A:${lastColumn}) for ${TAB}.`);

  const { email, key } = credentials();
  const sheets = google.sheets({
    version: "v4",
    auth: new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }),
  });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const titles = (meta.data.sheets ?? []).map((sheet) => sheet.properties?.title ?? "");
  const exists = titles.includes(TAB);

  if (exists) {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:${lastColumn}1` });
    const actual = (response.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
    const mismatch = headers.findIndex((header, index) => actual[index] !== header);
    if (actual.length === 0) {
      if (!apply) {
        console.log(`Tab exists but row 1 is empty. Re-run with --apply to write the ${headers.length} headers.`);
        return;
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A1:${lastColumn}1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
      console.log(`Wrote the ${headers.length} header cells into ${TAB}!A1:${lastColumn}1.`);
      return;
    }
    if (mismatch >= 0) {
      throw new Error(`Row 1 of ${TAB} differs at column ${mismatch + 1}: found "${actual[mismatch] ?? ""}", expected "${headers[mismatch]}". No changes were made.`);
    }
    console.log(`Tab already provisioned: ${actual.length} header cells match the contract. Nothing to do.`);
    return;
  }

  if (!apply) {
    console.log(`Tab "${TAB}" is MISSING. Re-run with --apply to create it with the ${headers.length} header cells in row 1.`);
    return;
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { rowCount: 1000, columnCount: EXPECTED_WIDTH } } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1:${lastColumn}1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  });
  console.log(`Created "${TAB}" and wrote the ${headers.length} header cells into row 1 (A:${lastColumn}).`);
}

main().catch((error) => {
  console.error("Provisioning failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

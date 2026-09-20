// Safe read-only inspection of the legacy Sales Order Tracker destination.
// SAFETY CONTRACT:
//   * READ-ONLY: only spreadsheets.values.get / get with ranges. No writes,
//     no appends, no sorts, no permission changes, no new tabs.
//   * Bounded: each read is capped to a fixed range (formula/sample rows).
//   * If no Google credentials are available (or the destination env vars are
//     absent) it prints the blocker checklist and exits 0 — it never guesses.
//
// Run:  node scripts/inspect-sales-order-destination.mjs
// Optionally point at a staging copy:
//       node scripts/inspect-sales-order-destination.mjs --spreadsheet <id> --sheet <gid>
/** Builds the same auth precedence as src/lib/googleSheets.createOAuth2Client. */
function buildAuth(google) {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (saKey && saKey.trim().startsWith("-----BEGIN")) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "aic-service-account@aic-nextjs-sheets-db-501208.iam.gserviceaccount.com",
      key: saKey.trim().replace(/\\n/g, "\n"),
      scopes,
    });
  }
  if (saKey) {
    const parsed = JSON.parse(saKey);
    return new google.auth.JWT({ email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n"), scopes });
  }
  if (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes,
    });
  }
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}
// Phase 1 Gate 5/6/7 evidence tooling.

const LEGACY_SPREADSHEET_ENV = "SALES_ORDER_LEGACY_SPREADSHEET_ID";
const LEGACY_TRACKER_SHEET_ENV = "SALES_ORDER_LEGACY_TRACKER_SHEET_ID";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv.length > index + 1 ? process.argv[index + 1] : null;
}

const spreadsheetId =
  argValue("--spreadsheet") ||
  process.env[LEGACY_SPREADSHEET_ENV] ||
  process.env.GOOGLE_SHEET_ID_LEGACY_TRACKER;
const trackerSheetId = argValue("--sheet") || process.env[LEGACY_TRACKER_SHEET_ENV];
void trackerSheetId;

/** Columns whose ownership must be verified by inspecting scripts/triggers. */
const OWNERSHIP_CHECKLIST = [
  ["A", "P", "Application synchronization worker (app-managed rows)"],
  ["Q", "S", "Existing inventory workflow (verify external workbooks)"],
  ["T", "T", "Existing delivery import (verify external workbook)"],
  ["U", "U", "Application assignee projection"],
  ["V", "V", "Application fulfillment projection"],
  ["W", "W", "Existing aging formula (formula ownership; do not overwrite)"],
];

function columnToA1(index) {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

async function main() {
  if (!spreadsheetId) {
    printBlockerChecklist();
    return 0;
  }
  let sheets;
  try {
    const google = (await import("googleapis")).google;
    sheets = google.sheets({ version: "v4", auth: buildAuth(google) });
  } catch (error) {
    console.log("No usable Google credentials in this environment.");
    console.log("  cause:", error.message);
    printBlockerChecklist();
    return 0;
  }

  console.log("=== Destination inspection (READ-ONLY) ===");
  console.log("Spreadsheet:", spreadsheetId);

  // 1. Tab inventory (meta only).
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties)" });
  for (const sheet of meta.data.sheets ?? []) {
    const p = sheet.properties ?? {};
    console.log(`Tab: "${p.title}" sheetId=${p.sheetId} rows=${p.gridProperties?.rowCount} cols=${p.gridProperties?.columnCount}`);
  }

  // 2. Tracker headers (A1:W1) and the first three data rows + a bounded tail.
  const headerRange = "'Sales Order Tracker'!A1:W4";
  const tailRange = "'Sales Order Tracker'!A1000:W1010";
  try {
    const head = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
    const header = head.data.values?.[0] ?? [];
    console.log("Tracker headers A:W (observed):");
    header.forEach((h, i) => {
      console.log(`  ${columnToA1(i)} = "${h}"${i < header.length - 1 ? "" : ""}`);
    });
    const tail = await sheets.spreadsheets.values.get({ spreadsheetId, range: tailRange });
    console.log(`Tracker populated tail sample (rows 1000-1010): ${tail.data.values?.length ?? 0} rows`);

    // 3. Formula scan of the first seven tracker rows + first seven service rows (raw values).
    for (const tab of ["Sales Order Tracker", "Services/ Repair"]) {
      const formulas = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tab}'!A1:W7`,
        valueRenderOption: "FORMULA",
      });
      console.log(`Formula sample (${tab}):`);
      (formulas.data.values ?? []).forEach((row, i) => {
        row.forEach((cell, j) => {
          const text = String(cell ?? "");
          if (text.startsWith("=")) console.log(`  ${tab}!${columnToA1(j)}${i + 1} formula: ${text.slice(0, 200)}`);
        });
      });
    }
  } catch (error) {
    console.log("Tab reads failed (tab name or IDs may differ):", error.message);
  }

  console.log("\n=== Ownership verification required before lock-in ===");
  OWNERSHIP_CHECKLIST.forEach(([from, to, owner]) => {
    console.log(`- ${from}..${to}: ${owner} — VERIFY in legacy Apps Script + triggers + external workbooks`);
  });
  console.log("\n=== Legacy write paths to disable at cutover ===");
  for (const path of ["Form button / Sales Order Entry submit", "Custom menu", "Installable triggers", "Web-app deployment", "Direct manual entry (operational restriction)"]) {
    console.log(`- [ ] ${path}`);
  }
  console.log("\nRead-only inspection complete. No writes were performed.");
  return 0;
}

function printBlockerChecklist() {
  console.log("Blocker (Phase 1 Gate 5/6/7): no live Google access is configured.");
  console.log("Set " + LEGACY_SPREADSHEET_ENV + " and " + LEGACY_TRACKER_SHEET_ENV +
    " to point at a STAGING COPY of the legacy workbook, then rerun this script.");
  console.log("Work that continues without credentials:");
  console.log("  - Column-A compatibility tests (scripts/sales-order-tests/domain-test.ts)");
  console.log("  - Gateway/lease local proofs (scripts/sales-order-tests/)");
  console.log("  - Migration dry-run tooling against a JSON snapshot");
}

process.exitCode = await main();
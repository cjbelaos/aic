// Controlled, one-time Sales Order sequence correction.
// The default mode is read-only. --apply updates only LastNumber and UpdatedAt
// after proving the exact current state supplied by the operator.
//
// Usage:
//   node --env-file=.env.local scripts/set-sales-order-sequence.mjs \
//     --business-year 2026 --expected-last-number 1 --last-number 1330
//   node --env-file=.env.local scripts/set-sales-order-sequence.mjs \
//     --business-year 2026 --expected-last-number 1 --last-number 1330 --apply

import { existsSync, readFileSync } from "node:fs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function requiredInteger(name) {
  const value = Number(argument(name));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function buildAuth(google) {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (serviceAccount) {
    const raw = serviceAccount.trim();
    if (raw.startsWith("-----BEGIN")) return new google.auth.JWT({ email: serviceAccountEmail, key: raw.replace(/\\n/g, "\n"), scopes });
    const parsed = JSON.parse(raw);
    return new google.auth.JWT({ email: parsed.client_email || serviceAccountEmail, key: parsed.private_key.replace(/\\n/g, "\n"), scopes });
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const raw = readFileSync(keyFile, "utf8").trim();
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw);
      return new google.auth.JWT({ email: parsed.client_email || serviceAccountEmail, key: parsed.private_key.replace(/\\n/g, "\n"), scopes });
    }
    return new google.auth.JWT({ email: serviceAccountEmail, key: raw.replace(/\\n/g, "\n"), scopes });
  }
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

function serialFor(year, value) {
  const match = new RegExp(`^AIC-SO-${year}-(\\d{4,})$`).exec(String(value ?? "").trim());
  return match ? Number(match[1]) : null;
}

async function main() {
  const businessYear = argument("--business-year").trim();
  if (!/^\d{4}$/.test(businessYear)) throw new Error("--business-year must be YYYY.");
  const expectedLastNumber = requiredInteger("--expected-last-number");
  const newLastNumber = requiredInteger("--last-number");
  if (newLastNumber <= expectedLastNumber) throw new Error("--last-number must be greater than --expected-last-number.");
  const apply = process.argv.includes("--apply");
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID_DATABASE is missing.");

  const { google } = await import("googleapis");
  const sheets = google.sheets({ version: "v4", auth: buildAuth(google) });
  const [sequenceResponse, ordersResponse] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrderSequences!A1:E100" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrders!A1:B10000" }),
  ]);
  const sequenceRows = sequenceResponse.data.values ?? [];
  const sequenceKey = `AIC-SO-${businessYear}`;
  const matches = sequenceRows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => String(row[0] ?? "").trim() === sequenceKey);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${sequenceKey} row; found ${matches.length}.`);

  const sequence = matches[0];
  const actualLastNumber = Number(sequence.row[3]);
  if (!Number.isSafeInteger(actualLastNumber) || actualLastNumber !== expectedLastNumber) {
    throw new Error(`${sequenceKey} LastNumber is ${String(sequence.row[3] ?? "")}, not the expected ${expectedLastNumber}. No change was made.`);
  }
  if (String(sequence.row[1] ?? "") !== "AIC-SO" || String(sequence.row[2] ?? "") !== businessYear) {
    throw new Error(`${sequenceKey} has an unexpected prefix/year schema. No change was made.`);
  }

  const assignedNumbers = (ordersResponse.data.values ?? []).slice(1)
    .map((row) => serialFor(businessYear, row[1]))
    .filter((number) => number !== null);
  const highestAssigned = assignedNumbers.length ? Math.max(...assignedNumbers) : 0;
  if (highestAssigned > expectedLastNumber) {
    throw new Error(`An existing ${businessYear} SalesOrderNo already reaches ${highestAssigned}; raising the sequence from ${expectedLastNumber} is unsafe. No change was made.`);
  }

  const report = { sequenceKey, rowNumber: sequence.rowNumber, expectedLastNumber, newLastNumber, highestAssigned, apply };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    console.log("Dry run complete. No Sheets writes were performed.");
    return;
  }

  const updatedAt = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `SalesOrderSequences!D${sequence.rowNumber}:E${sequence.rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[newLastNumber, updatedAt]] },
  });
  const verified = await sheets.spreadsheets.values.get({ spreadsheetId, range: `SalesOrderSequences!A${sequence.rowNumber}:E${sequence.rowNumber}` });
  console.log(JSON.stringify({ ...report, updatedRow: verified.data.values?.[0] ?? null }, null, 2));
  console.log("Sequence correction applied and re-read successfully.");
}

main().catch((error) => {
  console.error(`SEQUENCE_CORRECTION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

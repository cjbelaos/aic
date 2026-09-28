// Read-only inspection for a Sales Order confirmation/sequence correction.
// It never calls a Sheets write API and never prints credential values.
//
// Usage:
//   node --env-file=.env.local scripts/inspect-sales-order-sequence.mjs \
//     --sales-order-id <uuid>

import { existsSync, readFileSync } from "node:fs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function buildAuth(google) {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  if (serviceAccount) {
    const raw = serviceAccount.trim();
    if (raw.startsWith("-----BEGIN")) {
      return new google.auth.JWT({ email: serviceAccountEmail, key: raw.replace(/\\n/g, "\n"), scopes });
    }
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

function rowObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [String(header), row[index] ?? ""]));
}

async function main() {
  const salesOrderId = argument("--sales-order-id").trim();
  if (!salesOrderId) throw new Error("Pass --sales-order-id <uuid>.");
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID_DATABASE is missing.");

  const { google } = await import("googleapis");
  const sheets = google.sheets({ version: "v4", auth: buildAuth(google) });
  const [sequenceResponse, orderResponse] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrderSequences!A1:E100" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrders!A1:AI10000" }),
  ]);

  const sequenceRows = sequenceResponse.data.values ?? [];
  const orderRows = orderResponse.data.values ?? [];
  const headers = orderRows[0] ?? [];
  const target = orderRows.slice(1).find((row) => String(row[0] ?? "").trim() === salesOrderId);

  const report = {
    sequence2026: sequenceRows.slice(1).find((row) => String(row[0] ?? "").trim() === "AIC-SO-2026") ?? null,
    targetOrder: target
      ? (() => {
          const order = rowObject(headers, target);
          return {
            salesOrderId: order.SalesOrderId,
            salesOrderNo: order.SalesOrderNo,
            receivedDate: order.ReceivedDate,
            orderStatus: order.OrderStatus,
            version: order.Version,
            importQuality: order.ImportQuality,
          };
        })()
      : null,
  };
  console.log(JSON.stringify(report, null, 2));
  console.log("Read-only inspection complete. No Sheets writes were performed.");
}

main().catch((error) => {
  console.error(`READ_ONLY_INSPECTION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

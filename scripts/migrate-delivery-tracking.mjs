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
  throw new Error("Configure service-account credentials before running the migration.");
}

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const read = async (range) => (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
const norm = (value) => String(value ?? "").trim().toLowerCase();
const [optionRows, userRows, deliveryRows] = await Promise.all([read("DeliveredByNames!A2:F"), read("Users!A2:C"), read("DeliveryReceipts!A2:R")]);
const usersById = new Map(userRows.map((row) => [String(row[0] ?? "").trim(), String(row[2] ?? "").trim()]));
const userNames = new Set(userRows.map((row) => norm(row[2])).filter(Boolean));
const names = optionRows.map((row) => String(row[1] ?? row[0] ?? "").trim()).filter(Boolean);
const invalidUserReferences = optionRows.flatMap((row, index) => {
  const userId = String(row[5] ?? "").trim();
  return userId && !usersById.has(userId) ? [{ row: index + 2, name: String(row[1] ?? "").trim(), userId }] : [];
});
const linkedNames = optionRows.filter((row) => String(row[5] ?? "").trim() && usersById.has(String(row[5]).trim())).map((row) => String(row[1] ?? "").trim());
const unlinkedRows = optionRows.filter((row) => !String(row[5] ?? "").trim() && String(row[1] ?? row[0] ?? "").trim());
const externalNames = unlinkedRows.filter((row) => norm(row[2]) === "external" || ["lalamove", "on-call"].includes(norm(row[1]))).map((row) => String(row[1]).trim());
const internalUnlinkedNames = unlinkedRows.filter((row) => !(norm(row[2]) === "external" || ["lalamove", "on-call"].includes(norm(row[1])))).map((row) => String(row[1]).trim());
const nameOnlyMatches = names.filter((name) => userNames.has(norm(name)) && !linkedNames.includes(name));
const report = { mode: APPLY ? "apply" : "audit-only", currentRows: names.length, linkedUsersRemovedFromReferenceSheet: linkedNames, nameOnlyMatches, internalUnlinkedOptions: internalUnlinkedNames, externalOptions: externalNames, invalidUserReferences };
console.log(JSON.stringify(report, null, 2));
if (!APPLY) process.exit(invalidUserReferences.length ? 2 : 0);
if (invalidUserReferences.length) throw new Error("Migration stopped because one or more temporary UserId references are invalid.");

const externalRows = externalNames.map((name, index) => [`EXT-${String(index + 1).padStart(4, "0")}`, name, "external", "TRUE", norm(name) === "lalamove" ? "Third-party courier" : norm(name) === "on-call" ? "On-call external rider" : "External delivery personnel"]);
const internalRows = internalUnlinkedNames.map((name, index) => [`PERSON-${String(index + 1).padStart(4, "0")}`, name, "internal", "TRUE", "Internal personnel without an application user account"]);
await sheets.spreadsheets.values.clear({ spreadsheetId, range: "DeliveredByNames!A:F" });
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: "DeliveredByNames!A1:E", values: [["DeliveryOptionId", "DisplayName", "Type", "Active", "Notes"], ...internalRows, ...externalRows] },
      { range: "DeliveryReceipts!P1:R1", values: [["DeliveredById", "DeliveredByType", "DeliveredByOptionId"]] },
      { range: "DocumentHandover!O1", values: [["AssigneeType"]] },
    ],
  },
});
const externalByName = new Map(externalRows.map((row) => [norm(row[1]), row[0]]));
const deliveryTypeUpdates = deliveryRows.map((row, index) => {
  const externalId = externalByName.get(norm(row[8]));
  const deliveredById = String(row[15] ?? "").trim();
  return { range: `DeliveryReceipts!Q${index + 2}:R${index + 2}`, values: [[externalId && !deliveredById ? "external" : "internal", externalId && !deliveredById ? externalId : ""]] };
});
if (deliveryTypeUpdates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: deliveryTypeUpdates } });
console.log(JSON.stringify({ ok: true, internalUnlinkedOptions: internalRows.length, externalOptions: externalRows.length, alignedDeliveryReceipts: deliveryTypeUpdates.length, headersAligned: true }, null, 2));

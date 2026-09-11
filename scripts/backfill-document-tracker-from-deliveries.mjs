import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";

const APPLY = process.argv.includes("--apply");
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");
function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) { if (raw.trim().startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") }; const parsed = JSON.parse(raw); return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") }; }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) { const file = readFileSync(keyFile, "utf8").trim(); if (file.startsWith("-----BEGIN")) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file }; const parsed = JSON.parse(file); return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") }; }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  throw new Error("Configure service-account credentials before running the backfill.");
}

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const read = async (range) => (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
const [receipts, handovers, companies, users] = await Promise.all([read("DeliveryReceipts!A2:R"), read("DocumentHandover!A2:O"), read("Companies!A2:C"), read("Users!A2:C")]);
const companyNames = new Map(companies.map((row) => [String(row[0] ?? "").trim(), String(row[2] ?? "").trim()]));
const validUserIds = new Set(users.map((row) => String(row[0] ?? "").trim()));
const handoversByDocument = new Map();
for (const [index, row] of handovers.entries()) {
  if (String(row[1] ?? "").trim() !== "delivery_receipt") continue;
  const key = String(row[2] ?? "").trim(); const list = handoversByDocument.get(key) ?? [];
  list.push({ row, rowNumber: index + 2 }); handoversByDocument.set(key, list);
}

const creates = []; const updates = []; const returnedPreserved = []; const skipped = []; const duplicates = [];
for (const row of receipts) {
  const documentNumber = String(row[0] ?? "").trim();
  const numericNumber = Number.parseInt(documentNumber, 10);
  const status = String(row[10] ?? "").trim().toLowerCase();
  if (!Number.isFinite(numericNumber) || numericNumber <= 0 || ["draft", "deleted"].includes(status)) continue;
  const assignedToName = String(row[8] ?? "").trim();
  const assignedToId = String(row[15] ?? "").trim();
  const assigneeType = String(row[16] ?? "").trim().toLowerCase() === "external" ? "external" : "internal";
  if (!assignedToName || (assigneeType === "internal" && (!assignedToId || !validUserIds.has(assignedToId)))) {
    skipped.push({ drNumber: documentNumber, assignedToName, reason: !assignedToName ? "Missing DeliveredBy" : "Missing or invalid DeliveredById" }); continue;
  }
  const existing = handoversByDocument.get(documentNumber) ?? [];
  if (existing.length > 1) { duplicates.push({ drNumber: documentNumber, handoverRows: existing.map((entry) => entry.rowNumber) }); continue; }
  const desired = { documentNumber, customerName: companyNames.get(String(row[2] ?? "").trim()) || String(row[2] ?? "").trim(), assignedToId, assignedToName, assignedBy: String(row[12] ?? "").trim(), assignedByName: String(row[7] ?? "").trim(), assignedAt: String(row[9] ?? "").trim() || new Date().toISOString(), assigneeType };
  if (!existing.length) { creates.push(desired); continue; }
  const current = existing[0];
  if (String(current.row[9] ?? "").trim() === "returned") { returnedPreserved.push({ drNumber: documentNumber, rowNumber: current.rowNumber }); continue; }
  const currentId = String(current.row[4] ?? "").trim(); const currentName = String(current.row[5] ?? "").trim(); const currentType = String(current.row[14] ?? "internal").trim() || "internal";
  if (currentId !== assignedToId || currentName !== assignedToName || currentType !== assigneeType) updates.push({ ...desired, rowNumber: current.rowNumber });
}

console.log(JSON.stringify({ mode: APPLY ? "apply" : "audit-only", createCount: creates.length, updateCount: updates.length, returnedPreservedCount: returnedPreserved.length, skippedCount: skipped.length, duplicateCount: duplicates.length, creates: creates.map((entry) => ({ drNumber: entry.documentNumber, assignedTo: entry.assignedToName, type: entry.assigneeType })), updates: updates.map((entry) => ({ drNumber: entry.documentNumber, assignedTo: entry.assignedToName, type: entry.assigneeType })), returnedPreserved, skipped, duplicates }, null, 2));
if (!APPLY) process.exit(duplicates.length ? 2 : 0);
if (duplicates.length) throw new Error("Backfill stopped because duplicate tracker records require review.");

if (creates.length) {
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({ spreadsheetId, range: "DocumentHandover!A2:O", valueInputOption: "USER_ENTERED", requestBody: { values: creates.map((entry) => [randomUUID(), "delivery_receipt", entry.documentNumber, entry.customerName, entry.assignedToId, entry.assignedToName, entry.assignedBy, entry.assignedByName, entry.assignedAt || now, "handed_over", "", "", "", "Automatically assigned from historical Delivery Receipt", entry.assigneeType]) } });
}
if (updates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: updates.flatMap((entry) => [{ range: `DocumentHandover!E${entry.rowNumber}:H${entry.rowNumber}`, values: [[entry.assignedToId, entry.assignedToName, entry.assignedBy, entry.assignedByName]] }, { range: `DocumentHandover!O${entry.rowNumber}`, values: [[entry.assigneeType]] }]) } });
console.log(JSON.stringify({ ok: true, createdCount: creates.length, updatedCount: updates.length }, null, 2));

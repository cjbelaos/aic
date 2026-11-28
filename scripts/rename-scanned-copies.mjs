/**
 * Renames every record's Scanned copy in Drive to `{DR|SR|SI}-{MM}-{DD}-{YYYY}-{No.}-{Customer}.{ext}`
 * and moves Sales Invoice scans into the Sales Invoice scan folder.
 *
 *   npm run scans:rename          dry run: writes a CSV to tmp/ and changes nothing
 *   npm run scans:rename:apply    performs the renames and moves
 *
 * Safe to re-run: files already named and filed correctly are left alone.
 * Older Service Invoice scans are recognised only by their `SI-SCANNED_` name, so on apply their
 * link is first recorded in column T metadata (as new uploads do) before they are renamed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { google } from "googleapis";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadTs(file) {
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
  return loaded.exports;
}

const names = loadTs("src/lib/scannedCopyFileName.ts");

const APPLY = process.argv.includes("--apply");
const SALES_INVOICE_SCAN_FOLDER_ID = "1OvWCCqVw0KOSO48KjhcVhcvsweSKG7qY";
const LEGACY_PREFIX = "SI-SCANNED_";

const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");
for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) {
  if (!process.env[key]) throw new Error(`Missing ${key} (the Drive upload account).`);
}

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
  throw new Error("Configure service-account credentials before running.");
}

const sheets = google.sheets({ version: "v4", auth: new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: oauth });

async function rows(range) {
  return (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {}; // legacy plain-text status: left untouched
  }
}

/** Runs `fn` over items with a few requests in flight. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

// The Drive account must be able to file into the Sales Invoice folder before anything starts.
try {
  const folder = await drive.files.get({ fileId: SALES_INVOICE_SCAN_FOLDER_ID, fields: "name,capabilities(canAddChildren)", supportsAllDrives: true });
  if (!folder.data.capabilities?.canAddChildren) throw new Error("no edit access");
  console.log(`Sales Invoice scan folder: ${folder.data.name}`);
} catch (error) {
  throw new Error(`The Drive upload account cannot add files to the Sales Invoice folder ${SALES_INVOICE_SCAN_FOLDER_ID}: ${error.message}. Share it with that account as Editor first.`);
}

const companyNames = new Map();
(await rows("Companies!A2:C")).forEach((row, index) => {
  const name = String(row[2] ?? "").trim();
  if (!name) return;
  companyNames.set(String(row[0] ?? "").trim(), name);
  companyNames.set(`comp_${index + 2}`, name);
});
const customerName = (companyId) => companyNames.get(companyId) || companyId;

/** One record per document number (first row wins, as the app's lookups do). */
const records = [];
const seen = new Set();
(await rows("DeliveryReceipts!A2:AB")).forEach((row) => {
  const number = String(row[0] ?? "").trim();
  const link = String(row[27] ?? "").trim();
  if (!/^\d+$/.test(number) || Number(number) <= 0 || seen.has(`DR${number}`)) return;
  seen.add(`DR${number}`);
  if (link) records.push({ prefix: "DR", sheet: "DeliveryReceipts", number, date: String(row[1] ?? ""), companyId: String(row[2] ?? "").trim(), link, legacy: false });
});
for (const [prefix, sheet] of [["SR", "ServiceInvoices"], ["SI", "SalesInvoices"]]) {
  (await rows(`${sheet}!A2:T`)).forEach((row, index) => {
    const number = String(row[0] ?? "").trim();
    if (!number || seen.has(`${prefix}${number}`)) return;
    seen.add(`${prefix}${number}`);
    const metadata = parseMetadata(row[19]);
    const scanned = String(metadata.scannedFileLink ?? "").trim();
    const legacyLink = String(row[9] ?? "").trim();
    const base = { prefix, sheet, rowNumber: index + 2, number, date: String(row[1] ?? ""), companyId: String(row[2] ?? "").trim(), rawMetadata: row[19] };
    if (scanned) records.push({ ...base, link: scanned, legacy: false });
    // Only a J link whose Drive name starts with SI-SCANNED_ is a scan; checked below.
    else if (legacyLink) records.push({ ...base, link: legacyLink, legacy: true });
  });
}

console.log(`Checking ${records.length} scanned copies in Drive…`);

const plans = await mapLimit(records, 8, async (record) => {
  const plan = { type: record.prefix, number: record.number, link: record.link, fileId: "", currentName: "", newName: "", moveTo: "", backfillMetadata: record.legacy, action: "", reason: "" };
  const fileId = names.driveFileIdFromLink(record.link);
  if (!fileId) return { ...plan, action: "skip", reason: "not-a-drive-link" };
  plan.fileId = fileId;
  let file;
  try {
    file = (await drive.files.get({ fileId, fields: "name,parents,trashed,mimeType,capabilities(canRename,canMoveItemWithinDrive)", supportsAllDrives: true })).data;
  } catch (error) {
    return { ...plan, action: "skip", reason: error.code === 404 ? "not-found" : `drive-error: ${error.message}` };
  }
  plan.currentName = file.name ?? "";
  if (record.legacy && !plan.currentName.startsWith(LEGACY_PREFIX)) return null; // J is a generated PDF, not a scan
  if (file.trashed) return { ...plan, action: "skip", reason: "trashed" };
  if (!names.scanDateParts(record.date)) return { ...plan, action: "skip", reason: `no-date (${record.date || "blank"})` };
  plan.newName = names.scannedCopyFileName({
    prefix: record.prefix,
    date: record.date,
    number: record.number,
    customer: customerName(record.companyId),
    extension: names.scanExtension(plan.currentName, file.mimeType ?? undefined),
  }).name;
  const parents = file.parents ?? [];
  const needsMove = record.prefix === "SI" && !(parents.length === 1 && parents[0] === SALES_INVOICE_SCAN_FOLDER_ID);
  if (needsMove) plan.moveTo = SALES_INVOICE_SCAN_FOLDER_ID;
  plan.removeParents = needsMove ? parents.join(",") : "";
  const needsRename = plan.newName !== plan.currentName;
  if (!needsRename && !needsMove && !record.legacy) return { ...plan, action: "ok" };
  if (needsRename && !file.capabilities?.canRename) return { ...plan, action: "skip", reason: "no-edit-access" };
  if (needsMove && !file.capabilities?.canMoveItemWithinDrive) return { ...plan, action: "skip", reason: "cannot-move" };
  plan.action = [needsRename && "rename", needsMove && "move", record.legacy && "record-link"].filter(Boolean).join("+");
  plan.record = record;
  return plan;
});

const planned = plans.filter(Boolean);
const todo = planned.filter((plan) => !["ok", "skip"].includes(plan.action));

if (APPLY) {
  console.log(`Applying ${todo.length} changes…`);
  for (const plan of todo) {
    try {
      if (plan.backfillMetadata) {
        // Record the link the way new uploads do, so the invoice stays "Scanned" once the name changes.
        const metadata = parseMetadata(plan.record.rawMetadata);
        const range = `${plan.record.sheet}!T${plan.record.rowNumber}`;
        await sheets.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: "RAW", requestBody: { values: [[JSON.stringify({ ...metadata, scannedFileLink: plan.link })]] } });
      }
      await drive.files.update({
        fileId: plan.fileId,
        requestBody: plan.newName !== plan.currentName ? { name: plan.newName } : {},
        ...(plan.moveTo ? { addParents: plan.moveTo, removeParents: plan.removeParents || undefined } : {}),
        supportsAllDrives: true,
      });
      plan.result = "done";
    } catch (error) {
      plan.result = `failed: ${error.message}`;
    }
  }
}

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const header = ["type", "number", "action", "reason", "currentName", "newName", "moveTo", "fileId", "link", ...(APPLY ? ["result"] : [])];
const csv = [header.join(","), ...planned.map((plan) => [plan.type, plan.number, plan.action, plan.reason, plan.currentName, plan.newName, plan.moveTo, plan.fileId, plan.link, ...(APPLY ? [plan.result ?? ""] : [])].map(csvCell).join(","))].join("\r\n");
mkdirSync("tmp", { recursive: true });
const out = `tmp/rename-scanned-copies-${APPLY ? "apply" : "dry-run"}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
writeFileSync(out, `﻿${csv}`, "utf8");

const count = (predicate) => planned.filter(predicate).length;
console.log(JSON.stringify({
  mode: APPLY ? "apply" : "dry-run",
  scannedCopies: planned.length,
  toChange: todo.length,
  renames: count((p) => p.action.includes("rename")),
  moves: count((p) => p.action.includes("move")),
  legacyLinksRecorded: count((p) => p.action.includes("record-link")),
  alreadyCorrect: count((p) => p.action === "ok"),
  skipped: count((p) => p.action === "skip"),
  ...(APPLY ? { failed: count((p) => String(p.result ?? "").startsWith("failed")) } : {}),
  csv: out,
}, null, 2));

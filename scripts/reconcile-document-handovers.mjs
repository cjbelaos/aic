import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
const [invoices, receipts, handovers, companies, users] = await Promise.all([read("ServiceInvoices!A2:U"), read("DeliveryReceipts!A2:S"), read("DocumentHandover!A2:X"), read("Companies!A2:C"), read("Users!A2:C")]);
const userList = users.map(row => ({ userId: String(row[0] || "").trim(), fullName: String(row[2] || "").trim() }));
const companyNames = new Map(companies.map(row => [String(row[0]), String(row[2] || row[0])]));
const existing = new Set(handovers.map(row => `${row[1]}:${String(row[2]).trim()}`));
const receiptsByNumber = new Map(receipts.map(row => [String(row[0]).trim(), row]));
const candidates = []; const skipped = [];
for (const [type, rows] of [["service_invoice", invoices], ["delivery_receipt", receipts]]) {
  for (const row of rows) {
    const number = String(row[0] || "").trim();
    const status = String(row[type === "service_invoice" ? 8 : 10] || "created").trim().toLowerCase();
    if (!number || number.startsWith("DRAFT-") || Number(number) <= 0 || ["draft", "deleted", "cancelled", "void"].includes(status) || existing.has(`${type}:${number}`)) continue;
    const assigneeType = type === "delivery_receipt" && row[16] === "external" ? "external" : "internal";
    let assignedToId = String(row[type === "service_invoice" ? 12 : 15] || "").trim();
    let assignedToName = String(row[type === "service_invoice" ? 13 : 8] || "").trim();
    if (type === "service_invoice" && !assignedToId && row[11]) {
      const receipt = receiptsByNumber.get(String(row[11]).trim());
      if (receipt && receipt[16] !== "external") {
        assignedToId = String(receipt[15] || "").trim();
        assignedToName = String(receipt[8] || "").trim();
      }
    }
    if (!assignedToId && assigneeType === "internal") {
      const matches = userList.filter(user => user.fullName.toLowerCase() === assignedToName.toLowerCase());
      if (matches.length === 1) assignedToId = matches[0].userId;
    }
    const user = userList.find(user => user.userId === assignedToId);
    if ((assigneeType === "internal" && !user?.fullName) || (assigneeType === "external" && !assignedToName)) {
      skipped.push({ documentType:type, documentNumber:number, reason:"Missing or unresolved document holder" }); continue;
    }
    if (user && assigneeType === "internal") assignedToName = user.fullName;
    candidates.push({ documentType:type, documentNumber:number, customerName:companyNames.get(String(row[2])) || String(row[2]), assignedToId, assignedToName, assigneeType,
      assignedBy:String(row[type === "service_invoice" ? 4 : 12] || ""), assignedByName:String(row[type === "service_invoice" ? 3 : 7] || ""),
      assignedAt:String(row[type === "service_invoice" ? 5 : 9] || ""), notes:"Recovered missing automatic handover from source document; timestamp uses source creation time." });
    existing.add(`${type}:${number}`);
  }
}
console.log(JSON.stringify({ mode:APPLY ? "apply" : "audit", missingCount:candidates.length, skippedCount:skipped.length, missing:candidates.map(({documentType,documentNumber,assignedToName})=>({documentType,documentNumber,assignedToName})), skipped },null,2));
if (APPLY) {
  const require = createRequire(import.meta.url);
  const ts = require("typescript"); const mod = { exports:{} };
  const code = ts.transpileModule(readFileSync("src/lib/documentHandoverCommit.ts","utf8"), { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = { "@/lib/googleSheets": {getSheetsClient:async()=>sheets,getDatabaseSpreadsheetId:async()=>spreadsheetId}, "@/lib/userSheets":{getUsers:async()=>userList,getUserById:async id=>userList.find(user=>user.userId===id)} };
  new Function("require","module","exports",code)(id=>mocks[id] ?? require(id),mod,mod.exports);
  let created = 0;
  for (const candidate of candidates) {
    if (await mod.exports.commitDocumentWithHandover(undefined,candidate) === "created") created++;
    await new Promise(resolve => setTimeout(resolve, 2100)); // Stay below Sheets per-user read quota.
  }
  console.log(JSON.stringify({created, skipped:skipped.length}));
}

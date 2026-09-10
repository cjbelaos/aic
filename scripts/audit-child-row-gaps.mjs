import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const targets = ["PurchaseOrderItemsV2!A2:I", "DeliveryReceiptItemsV2!A2:H", "ServiceInvoiceItems!A2:E", "QuotationDetails!A2:E", "QuotationNotations!A2:B", "QuotationDetailsV2!A2:H"];
const gaps = (sheet, rows) => rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }, index) => index < rows.length - 1 && row.every((value) => String(value ?? "").trim() === "")).map(({ rowNumber }) => ({ sheet, rowNumber, issue: "Blank physical row inside child data range" }));
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8") : "");
if (!raw) throw new Error("Configure service-account credentials before running this read-only audit.");
const key = JSON.parse(raw); const auth = new google.auth.JWT({ email: key.client_email, key: key.private_key.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const reports = [];
for (const range of targets) { try { const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? []; reports.push(...gaps(range.split("!")[0], rows)); } catch (error) { if (!/not found|unable to parse range/i.test(String(error))) throw error; } }
console.log(JSON.stringify({ mode: "read-only", affectedRows: reports.length, reports }, null, 2));

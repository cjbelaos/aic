// Read-only verification of the Sales Order schema in GOOGLE_SHEET_ID_DATABASE.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const TAB_HEADERS = {
  SalesOrders: ["SalesOrderId", "SalesOrderNo", "LegacyTrackerNo", "ReceivedDate", "CustomerId", "CustomerNameSnapshot", "CustomerTINSnapshot", "BillingAddressSnapshot", "ContactId", "ContactNameSnapshot", "ContactPhoneSnapshot", "DeliveryAddressSnapshot", "CustomerPONo", "QuotationNo", "PaymentTermId", "PaymentTermsSnapshot", "RequiredDate", "AssignedToUserId", "Currency", "OrderStatus", "FulfillmentStatus", "SubtotalExTax", "DiscountTotal", "TaxTotal", "GrandTotal", "Remarks", "Version", "ConfirmedAt", "ClosedAt", "CancelReason", "ImportQuality", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  SalesOrderItems: ["SalesOrderItemId", "SalesOrderId", "LineNo", "OrderCategory", "LineType", "ProductId", "ProductCodeSnapshot", "ProductNameSnapshot", "CustomerProductNameSnapshot", "Description", "UnitId", "UnitSnapshot", "Quantity", "UnitPrice", "PriceSource", "CustomerProductPriceId", "QuotationLineReference", "DiscountAmount", "TaxMode", "TaxRate", "SubtotalExTax", "TaxAmount", "LineTotal", "FulfilledQty", "CancelledQty", "LineStatus", "PriceOverrideReason", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  SalesOrderHistory: ["EventId", "SalesOrderId", "SalesOrderItemId", "EventType", "FromStatus", "ToStatus", "ChangedFieldsJson", "Reason", "CommandId", "ActorUserId", "CreatedAt"],
  SalesOrderDocuments: ["DocumentId", "SalesOrderId", "DocumentType", "ExternalDocumentNo", "DriveFileId", "ExternalUrl", "FileName", "MimeType", "OrderVersion", "GenerationStatus", "ErrorCode", "CreatedAt", "CreatedBy"],
  SalesOrderFulfillments: ["FulfillmentId", "SalesOrderId", "SalesOrderItemId", "FulfillmentType", "SourceDocumentType", "SourceDocumentId", "SourceLineId", "Quantity", "EffectiveDate", "EvidenceDriveFileId", "ReversesFulfillmentId", "Status", "CommandId", "CreatedAt", "CreatedBy"],
  SalesOrderDocumentLinks: ["LinkId", "SalesOrderId", "SalesOrderItemId", "DocumentType", "DocumentId", "DocumentLineId", "LinkedQty", "LinkStatus", "CommandId", "CreatedAt", "CreatedBy"],
  SalesOrderSequences: ["SequenceKey", "Prefix", "BusinessYear", "LastNumber", "UpdatedAt"],
  SalesOrderCommands: ["CommandId", "PayloadHash", "CommandType", "SalesOrderId", "ResultVersion", "ResultJson", "CommittedAt", "ActorUserId"],
  SalesOrderImportMap: ["ImportKey", "SourceSpreadsheetId", "SourceSheetId", "SourceRow", "SourceTrackerNo", "SourceHash", "TargetSalesOrderId", "TargetSalesOrderItemId", "ImportBatchId", "ImportStatus", "IssueCodes", "ImportedAt"],
  SalesOrderSyncJobs: ["SyncJobId", "SalesOrderId", "OrderVersion", "DestinationSpreadsheetId", "DestinationSheetId", "Status", "AttemptCount", "NextAttemptAt", "LastErrorCode", "LastErrorMessage", "LeaseToken", "LeaseOwner", "LeaseExpiresAt", "CreatedAt", "LastAttemptAt", "SyncedAt"],
  SalesOrderSyncMap: ["DestinationSpreadsheetId", "DestinationSheetId", "SalesOrderItemId", "SalesOrderId", "DestinationRowHint", "LastSyncedVersion", "LastSyncedHash", "LastSyncedAt"],
};

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
  throw new Error("Configure service-account credentials before verifying the workbook.");
}

function compareHeaders(expected, actual) {
  const issues = [];
  const width = Math.max(expected.length, actual.length);
  for (let index = 0; index < width; index += 1) {
    if ((actual[index] ?? "") !== (expected[index] ?? "")) {
      issues.push({ column: index + 1, expected: expected[index] ?? "<none>", actual: actual[index] ?? "<blank>" });
    }
  }
  return issues;
}

const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");
const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title)" });
const existingTabs = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));
const results = [];

for (const [tab, expected] of Object.entries(TAB_HEADERS)) {
  if (!existingTabs.has(tab)) {
    results.push({ tab, ok: false, issue: "missing tab" });
    continue;
  }
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!1:1` });
  const actual = response.data.values?.[0] ?? [];
  const issues = compareHeaders(expected, actual);
  results.push({ tab, ok: issues.length === 0, expectedColumns: expected.length, actualColumns: actual.length, issues });
}

for (const [tab, expectedAtEnd] of [["DeliveryReceipts", ["SalesOrderId"]], ["DeliveryReceiptItems", ["DeliveryReceiptItemId", "SalesOrderItemId"]]]) {
  if (!existingTabs.has(tab)) {
    results.push({ tab, ok: false, issue: "missing existing integration tab" });
    continue;
  }
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!1:1` });
  const actual = response.data.values?.[0] ?? [];
  const missing = expectedAtEnd.filter((header) => !actual.includes(header));
  const extraIssue = tab === "DeliveryReceipts" && actual[4] !== "SalesOrderNo"
    ? [{ column: 5, expected: "SalesOrderNo", actual: actual[4] ?? "<blank>" }]
    : [];
  results.push({ tab, ok: missing.length === 0 && extraIssue.length === 0, missing, issues: extraIssue });
}

const ok = results.every((result) => result.ok);
console.log(JSON.stringify({ ok, checkedTabs: results.length, results }, null, 2));
process.exitCode = ok ? 0 : 1;

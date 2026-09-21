// Service Report schema verification (READ-ONLY provisioning gate).
// Verifies the FIVE Service Report tabs + the four appended ServiceInvoices
// columns (O..R) and the Drive env var. NEVER writes.
// Run: node --env-file=.env.local scripts/verify-service-report-schema.mjs
//
// Manual provisioning (do NOT run any script against the live sheet):
//   1. The ServiceReports tab must carry the canonical 34-column schema in row 1
//      (A:AH), in this exact order:
//        ServiceReportId, ServiceReportNo, ReportType, ServiceInvoiceNo, CompanyId,
//        CompanyNameSnapshot, ClientNameSnapshot, ClientAddressSnapshot,
//        AssignedTechnicianUserId, AssignedTechnicianNameSnapshot, ServiceDate,
//        ServiceType, FieldReport, Remarks, AcknowledgedByFullName,
//        AcknowledgedByPosition, AcknowledgmentTextVersion, ConsentConfirmed,
//        SignatureDriveFileId, SignatureUrl, SignatureSha256, SignatureMimeType,
//        SignatureSize, SignedAt, Status, Version, PdfDriveFileId, PdfUrl,
//        PdfGenerationStatus, VoidReason, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
//      `ReportType` is column C; the `CompanyId` column holds the domain field
//      `customerId`. This verifier compares names AND order AND width, so the
//      header row must match positionally. Do not reorder, rename or add columns.
//      (Leave historical ReportType cells blank — a blank value resolves to
//       GENERAL.) Reordering the header row does NOT move the data: reordering
//      column values is a separate, explicitly approved migration.
//   2. The tab `WaterTreatmentServiceReportDetails` must exist with its 89
//      headers in row 1, in this exact order. Copy the header line from
//      `node scripts/verify-service-report-schema.mjs --print-headers` or from
//      docs/SERVICE-REPORT-PROVISIONING.md — or create the tab additively with
//        node --env-file=.env.local scripts/provision-water-treatment-details-tab.mjs --apply
//      which creates the tab and writes row 1 only (no other tab or row is
//      touched).
//   3. Ensure GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID exists for the private
//      signature/PDF folder.
//   4. Optional idempotent backfill of historical blank ReportType values:
//        node --env-file=.env.local scripts/backfill-service-report-types.mjs        (preview)
//        node --env-file=.env.local scripts/backfill-service-report-types.mjs --apply

import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

// Canonical ServiceReports schema: 34 columns, A:AH. ReportType is column C and
// CompanyId (domain field customerId) is column E.
const SERVICE_REPORTS_HEADERS = [
  "ServiceReportId","ServiceReportNo","ReportType","ServiceInvoiceNo","CompanyId",
  "CompanyNameSnapshot","ClientNameSnapshot","ClientAddressSnapshot",
  "AssignedTechnicianUserId","AssignedTechnicianNameSnapshot","ServiceDate",
  "ServiceType","FieldReport","Remarks","AcknowledgedByFullName",
  "AcknowledgedByPosition","AcknowledgmentTextVersion","ConsentConfirmed",
  "SignatureDriveFileId","SignatureUrl","SignatureSha256","SignatureMimeType",
  "SignatureSize","SignedAt","Status","Version","PdfDriveFileId","PdfUrl",
  "PdfGenerationStatus","VoidReason","CreatedAt","CreatedBy","UpdatedAt",
  "UpdatedBy",
];
const SERVICE_REPORTS_HISTORY_HEADERS = [
  "EventId","ServiceReportId","EventType","FromStatus","ToStatus",
  "ChangedFieldsJson","Reason","CommandId","ActorUserId","CreatedAt",
];
const SERVICE_REPORTS_SEQUENCES_HEADERS = [
  "SequenceKey","Prefix","BusinessYear","LastNumber","UpdatedAt",
];
const SERVICE_REPORTS_COMMANDS_HEADERS = [
  "CommandId","PayloadHash","CommandType","ServiceReportId","ResultVersion",
  "ResultJson","CommittedAt","ActorUserId",
];
// WaterTreatmentServiceReportDetails: 89 columns, ServiceReportId is both the
// primary key and the foreign key to ServiceReports. Exactly one row per
// WATER_TREATMENT report; General reports create no row here.
const WATER_TREATMENT_DETAILS_HEADERS = [
  "ServiceReportId","EmailAddress",
  "FeedTdsBefore","FeedTdsAfter",
  "PreFilterInletPressureBefore","PreFilterInletPressureAfter",
  "Ro1aPureTdsBefore","Ro1aPureTdsAfter",
  "Ro1aInletPressureBefore","Ro1aInletPressureAfter",
  "Ro1aConcentratePressureBefore","Ro1aConcentratePressureAfter",
  "Ro1aPureFlowBefore","Ro1aPureFlowAfter",
  "Ro1aConcentrateFlowBefore","Ro1aConcentrateFlowAfter",
  "Ro1bPureTdsBefore","Ro1bPureTdsAfter",
  "Ro1bInletPressureBefore","Ro1bInletPressureAfter",
  "Ro1bConcentratePressureBefore","Ro1bConcentratePressureAfter",
  "Ro1bPureFlowBefore","Ro1bPureFlowAfter",
  "Ro1bConcentrateFlowBefore","Ro1bConcentrateFlowAfter",
  "Ro2PureTdsBefore","Ro2PureTdsAfter",
  "Ro2InletPressureBefore","Ro2InletPressureAfter",
  "Ro2ConcentratePressureBefore","Ro2ConcentratePressureAfter",
  "Ro2PureFlowBefore","Ro2PureFlowAfter",
  "Ro2ConcentrateFlowBefore","Ro2ConcentrateFlowAfter",
  "StartLoopPressureBefore","StartLoopPressureAfter",
  "EndLoopPressureBefore","EndLoopPressureAfter",
  "PreMediaPressureBefore","PreMediaPressureAfter",
  "PostMediaPressureBefore","PostMediaPressureAfter",
  "PostCarbon1PressureBefore","PostCarbon1PressureAfter",
  "PostCarbon2PressureBefore","PostCarbon2PressureAfter",
  "PostSoftenerPressureBefore","PostSoftenerPressureAfter",
  "BrineTankLevelBefore","BrineTankLevelAfter",
  "MicrobiologicalWaterSampleResult","PhysicalChemicalWaterSampleResult",
  "RawTankStatus","RawTankLowLevelSensorStatus","RawTankFloatValveStatus",
  "RawTankFullRefillStatus","MultiMediaControlValveStatus",
  "Carbon1ControlValveStatus","Carbon2ControlValveStatus",
  "Softener1ControlValveStatus","Softener2ControlValveStatus",
  "RawPumpAStatus","RawPumpApcStatus","RawPumpBStatus","RawPumpBApcStatus",
  "CipLowLevelSensorStatus","CipFullRefillStatus","RoControlPanelTerminalStatus",
  "FeedControlPanelTerminalStatus","DistributionControlPanelTerminalStatus",
  "Ro1PumpStatus","Ro2PumpStatus","Ro1MembraneStatus","Ro2MembraneStatus",
  "Ro1ProductTankLowLevelSensorStatus","Ro1ProductTankFullRefillSensorStatus",
  "Ro2ProductTankLowLevelSensorStatus","Ro2ProductTankFullRefillSensorStatus",
  "DistributionPumpStatus","PressureSensorsStatus","UvLightStatus",
  "Remarks","Recommendation","CreatedAt","CreatedBy","UpdatedAt","UpdatedBy",
];
const SERVICE_INVOICES_BASE_HEADERS = [
  "InvoiceNo","Date","CustomerId","PreparedBy","CreatedBy","CreatedAt",
  "UpdatedBy","UpdatedAt","Status","DriveFileLink","ContractId","DRNo",
  "DeliveredById","DeliveredByName",
];
const SERVICE_INVOICES_APPENDED_HEADERS = [
  "AssignedTechnicianUserId","AssignedTechnicianName","ServiceReportId",
  "ServiceReportStatus",
];
const TABS = [
  { tab: "ServiceReports", headers: SERVICE_REPORTS_HEADERS },
  { tab: "WaterTreatmentServiceReportDetails", headers: WATER_TREATMENT_DETAILS_HEADERS },
  { tab: "ServiceReportHistory", headers: SERVICE_REPORTS_HISTORY_HEADERS },
  { tab: "ServiceReportSequences", headers: SERVICE_REPORTS_SEQUENCES_HEADERS },
  { tab: "ServiceReportCommands", headers: SERVICE_REPORTS_COMMANDS_HEADERS },
];

function columnEnd(count) {
  let label = "", n = count - 1;
  while (n >= 0) { label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26) - 1; }
  return label;
}

async function createSheetsClient() {
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "aic-service-account@aic-nextjs-sheets-db-501208.iam.gserviceaccount.com";
  const scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"];
  let jwt;
  const fromRaw = (raw) => {
    const trimmed = String(raw).trim();
    if (trimmed.startsWith("-----BEGIN")) return new google.auth.JWT({ email: saEmail, key: trimmed.replace(/\\n/g, "\n"), scopes });
    const parsed = JSON.parse(trimmed);
    return new google.auth.JWT({ email: parsed.client_email || saEmail, key: parsed.private_key.replace(/\\n/g, "\n"), scopes });
  };
  // Same precedence as src/lib/googleSheets.ts: inline key, then key file.
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (saKey) {
    jwt = fromRaw(saKey);
  } else if (keyFile && existsSync(keyFile)) {
    jwt = fromRaw(readFileSync(keyFile, "utf8"));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    jwt = new google.auth.JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), scopes });
  }
  if (!jwt) throw new Error("No Google credentials found (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_PRIVATE_KEY).");
  return { sheets: google.sheets({ version: "v4", auth: jwt }) };
}

async function readHeaderRow(sheets, spreadsheetId, tab, end) {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:${end}1` });
    return (response.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
  } catch { return null; }
}
/** Positional diff: detects wrong names, wrong order AND wrong width. */
function diffHeaders(expected, actual) {
  const mismatches = [];
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      mismatches.push(i >= actual.length
        ? `col ${i + 1} missing (expected "${expected[i]}")`
        : `col ${i + 1} is "${actual[i]}" expected "${expected[i]}"`);
    }
  }
  if (actual.length > expected.length) {
    mismatches.push(`width is ${actual.length} columns, expected ${expected.length} (extra: ${actual.slice(expected.length).join(",")})`);
  }
  return mismatches;
}

function selfTest() {
  const expected = ["ServiceReportId", "EmailAddress", "FeedTdsBefore"];
  const cases = [
    { name: "exact match passes", actual: [...expected], shouldFail: false },
    { name: "wrong name detected", actual: ["ServiceReportId", "Email", "FeedTdsBefore"], shouldFail: true },
    { name: "reordered columns detected", actual: ["ServiceReportId", "FeedTdsBefore", "EmailAddress"], shouldFail: true },
    { name: "missing column detected", actual: ["ServiceReportId", "EmailAddress"], shouldFail: true },
    { name: "extra column (wrong width) detected", actual: [...expected, "Unexpected"], shouldFail: true },
  ];
  let failures = 0;
  for (const testCase of cases) {
    const mismatches = diffHeaders(expected, testCase.actual);
    const failed = mismatches.length > 0;
    if (failed !== testCase.shouldFail) {
      failures += 1;
      console.error(`  [FAIL] ${testCase.name}: mismatches=[${mismatches.join("; ")}]`);
    } else {
      console.log(`  [OK]   ${testCase.name}`);
    }
  }
  console.log(failures === 0
    ? "\nSchema verifier self-test passed (names, order, width)."
    : `\nSchema verifier self-test FAILED (${failures} case(s)).`);
  process.exitCode = failures === 0 ? 0 : 1;
}

async function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  if (process.argv.includes("--print-headers")) {
    console.log("# ServiceReports (34 columns, exact canonical order A:AH, ReportType in column C):");
    console.log(SERVICE_REPORTS_HEADERS.join(","));
    console.log("");
    console.log("# WaterTreatmentServiceReportDetails (89 columns, exact order):");
    console.log(WATER_TREATMENT_DETAILS_HEADERS.join(","));
    return;
  }
  const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
  const problems = [];
  const ok = [];

  if (!spreadsheetId) {
    problems.push("Missing GOOGLE_SHEET_ID_DATABASE environment variable.");
  } else {
    const { sheets } = await createSheetsClient();
    for (const { tab, headers } of TABS) {
      const actual = await readHeaderRow(sheets, spreadsheetId, tab, columnEnd(headers.length));
      if (actual === null) { problems.push(`${tab}: tab/range not readable (missing tab?).`); continue; }
      // Positional check: detects wrong names, wrong order AND wrong width.
      const mismatches = diffHeaders(headers, actual);
      if (mismatches.length === 0) ok.push(`${tab}: headers OK (${headers.length} columns, exact name/order/width).`);
      else problems.push(`${tab}: ${mismatches.join("; ")}`);
    }

    const invActual = await readHeaderRow(sheets, spreadsheetId, "ServiceInvoices", columnEnd(18));
    if (invActual === null) {
      problems.push("ServiceInvoices: header row not readable.");
    } else {
      for (let i = 0; i < 14; i++) {
        if (invActual[i] !== SERVICE_INVOICES_BASE_HEADERS[i]) {
          problems.push(`ServiceInvoices column ${columnEnd(i + 1)} is "${invActual[i] ?? ""}" expected "${SERVICE_INVOICES_BASE_HEADERS[i]}" (existing columns must not shift).`);
        }
      }
      const appended = invActual.slice(14, 18);
      const missing = SERVICE_INVOICES_APPENDED_HEADERS.filter((expected) => !appended.includes(expected));
      const unexpected = appended.filter((cell) => !SERVICE_INVOICES_APPENDED_HEADERS.includes(cell));
      if (missing.length === 0 && unexpected.length === 0) ok.push("ServiceInvoices: appended columns O..R OK (A..N unchanged).");
      else problems.push(`ServiceInvoices appended O..R: missing=[${missing.join(",")}] unexpected=[${unexpected.join(",")}]`);
    }
  }

  const driveFolderId = (process.env.GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID ?? "").trim();
  if (!driveFolderId) problems.push("Missing GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID environment variable.");
  else ok.push(`GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID is configured (value length ${driveFolderId.length}).`);

  for (const entry of ok) console.log(`  [OK]     ${entry}`);
  for (const entry of problems) console.log(`  [ISSUE]  ${entry}`);
  console.log(problems.length > 0
    ? `\nResult: NOT PROVISIONED (${problems.length} issue(s)).`
    : "\nResult: PROVISIONED. Manual steps remain: create the Drive folder and grant the service account access.");
  process.exitCode = problems.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("Schema verification failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

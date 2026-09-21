// ServiceReports header contract + row-mapper round-trip tests.
//
// Guards the canonical 34-column ServiceReports schema (A:AH) declared in
// src/lib/serviceReports/constants.ts and the pure mappers in
// src/lib/serviceReports/reportRow.ts. The live sheet was reordered by hand to
// this order, so the name -> position mapping is asserted column by column.

import assert from "node:assert/strict";
import {
  SERVICE_REPORTS_HEADERS,
  SERVICE_REPORTS_ROW_WIDTH,
} from "../../src/lib/serviceReports/constants.ts";
import { reportFromRow, reportToRow } from "../../src/lib/serviceReports/reportRow.ts";
import { invoiceCoarseFromRow } from "../../src/lib/serviceReports/invoiceRow.ts";
import { SERVICE_INVOICES_ROW_WIDTH } from "../../src/lib/serviceReports/constants.ts";
import type { ServiceReport } from "../../src/types/serviceReport.ts";

// 1. Exact canonical order, all 34 columns.
const EXPECTED_HEADERS = [
  "ServiceReportId", // A
  "ServiceReportNo", // B
  "ReportType", // C
  "ServiceInvoiceNo", // D
  "CompanyId", // E
  "CompanyNameSnapshot", // F
  "ClientNameSnapshot", // G
  "ClientAddressSnapshot", // H
  "AssignedTechnicianUserId", // I
  "AssignedTechnicianNameSnapshot", // J
  "ServiceDate", // K
  "ServiceType", // L
  "FieldReport", // M
  "Remarks", // N
  "AcknowledgedByFullName", // O
  "AcknowledgedByPosition", // P
  "AcknowledgmentTextVersion", // Q
  "ConsentConfirmed", // R
  "SignatureDriveFileId", // S
  "SignatureUrl", // T
  "SignatureSha256", // U
  "SignatureMimeType", // V
  "SignatureSize", // W
  "SignedAt", // X
  "Status", // Y
  "Version", // Z
  "PdfDriveFileId", // AA
  "PdfUrl", // AB
  "PdfGenerationStatus", // AC
  "VoidReason", // AD
  "CreatedAt", // AE
  "CreatedBy", // AF
  "UpdatedAt", // AG
  "UpdatedBy", // AH
];
assert.deepEqual(
  [...SERVICE_REPORTS_HEADERS],
  EXPECTED_HEADERS,
  "SERVICE_REPORTS_HEADERS must match the canonical 34-column A:AH order",
);
assert.equal(SERVICE_REPORTS_HEADERS.length, 34, "ServiceReports has 34 columns (A:AH)");
assert.equal(SERVICE_REPORTS_ROW_WIDTH, 34, "row width stays 34 for the A:AH range");
assert.equal(new Set(SERVICE_REPORTS_HEADERS).size, 34, "no duplicate header names");
// The reordered columns that the previous schema got wrong.
assert.equal(SERVICE_REPORTS_HEADERS[2], "ReportType", "ReportType is column C");
assert.equal(SERVICE_REPORTS_HEADERS[4], "CompanyId", "CompanyId is column E");
assert.equal(SERVICE_REPORTS_HEADERS[21], "SignatureMimeType", "SignatureMimeType is column V");
assert.equal(SERVICE_REPORTS_HEADERS[22], "SignatureSize", "SignatureSize is column W");
assert.equal(SERVICE_REPORTS_HEADERS[23], "SignedAt", "SignedAt is column X");
assert.equal(SERVICE_REPORTS_HEADERS[33], "UpdatedBy", "UpdatedBy is column AH");

const columnOf = (header: string): number => SERVICE_REPORTS_HEADERS.indexOf(header);

// 2. A fully populated report survives reportToRow -> reportFromRow unchanged.
const populated: ServiceReport = {
  serviceReportId: "SR-0001",
  serviceReportNo: "AIC-SR-2026-0007",
  reportType: "WATER_TREATMENT",
  serviceInvoiceNo: "1001",
  customerId: "CMP-0042",
  companyNameSnapshot: "Acme Waterworks Inc.",
  clientNameSnapshot: "Jane Client",
  clientAddressSnapshot: "12 Industrial Ave, Cebu City",
  assignedTechnicianUserId: "USR-9",
  assignedTechnicianNameSnapshot: "Tech Nine",
  serviceDate: "2026-09-20",
  serviceType: "Preventive Maintenance",
  fieldReport: "Completed the scheduled inspection of the RO train.",
  remarks: "No leaks observed.",
  acknowledgedByFullName: "Jane Client",
  acknowledgedByPosition: "Plant Manager",
  acknowledgmentTextVersion: "v1",
  consentConfirmed: true,
  signatureDriveFileId: "drive-signature-file",
  signatureUrl: "/api/service-reports/SR-0001/signature",
  signatureSha256: "a".repeat(64),
  signatureMimeType: "image/png",
  signatureSize: 20480,
  signedAt: "2026-09-20T08:15:00.000Z",
  status: "ACKNOWLEDGED",
  version: 4,
  pdfDriveFileId: "drive-pdf-file",
  pdfUrl: "/api/service-reports/SR-0001/pdf",
  pdfGenerationStatus: "READY",
  voidReason: "",
  createdAt: "2026-09-19T01:00:00.000Z",
  createdBy: "USR-9",
  updatedAt: "2026-09-20T08:20:00.000Z",
  updatedBy: "USR-9",
};

const row = reportToRow(populated);
assert.equal(row.length, 34, "reportToRow emits exactly 34 cells");
assert.equal(reportFromRow(row).serviceReportId, populated.serviceReportId);

// Every header must carry the field the repository maps to it. Positional
// assertions against the declared header row also catch a mapper that repeats
// the same wrong index in both directions.
const expectedCells: Array<[string, string | number]> = [
  ["ServiceReportId", populated.serviceReportId],
  ["ServiceReportNo", populated.serviceReportNo],
  ["ReportType", populated.reportType],
  ["ServiceInvoiceNo", populated.serviceInvoiceNo],
  ["CompanyId", populated.customerId],
  ["CompanyNameSnapshot", populated.companyNameSnapshot],
  ["ClientNameSnapshot", populated.clientNameSnapshot],
  ["ClientAddressSnapshot", populated.clientAddressSnapshot],
  ["AssignedTechnicianUserId", populated.assignedTechnicianUserId],
  ["AssignedTechnicianNameSnapshot", populated.assignedTechnicianNameSnapshot],
  ["ServiceDate", populated.serviceDate],
  ["ServiceType", populated.serviceType],
  ["FieldReport", populated.fieldReport],
  ["Remarks", populated.remarks],
  ["AcknowledgedByFullName", populated.acknowledgedByFullName],
  ["AcknowledgedByPosition", populated.acknowledgedByPosition],
  ["AcknowledgmentTextVersion", populated.acknowledgmentTextVersion],
  ["ConsentConfirmed", "YES"],
  ["SignatureDriveFileId", populated.signatureDriveFileId],
  ["SignatureUrl", populated.signatureUrl],
  ["SignatureSha256", populated.signatureSha256],
  ["SignatureMimeType", populated.signatureMimeType],
  ["SignatureSize", String(populated.signatureSize)],
  ["SignedAt", populated.signedAt],
  ["Status", populated.status],
  ["Version", String(populated.version)],
  ["PdfDriveFileId", populated.pdfDriveFileId],
  ["PdfUrl", populated.pdfUrl],
  ["PdfGenerationStatus", populated.pdfGenerationStatus],
  ["VoidReason", populated.voidReason],
  ["CreatedAt", populated.createdAt],
  ["CreatedBy", populated.createdBy],
  ["UpdatedAt", populated.updatedAt],
  ["UpdatedBy", populated.updatedBy],
];
assert.equal(expectedCells.length, 34, "the expectation table covers every column");
for (const [header, expected] of expectedCells) {
  assert.equal(
    row[columnOf(header)],
    expected,
    `${header} (column ${columnOf(header) + 1}) must carry the ServiceReport field mapped to it`,
  );
}

// 3. The round trip retains every field, in both directions.
const roundTripped = reportFromRow(row);
assert.deepEqual(roundTripped, populated, "reportToRow -> reportFromRow must retain every field");
assert.equal(roundTripped.reportType, "WATER_TREATMENT");
assert.equal(roundTripped.customerId, "CMP-0042");
assert.equal(roundTripped.signatureMimeType, "image/png");
assert.equal(roundTripped.signatureSize, 20480);
assert.equal(roundTripped.signedAt, "2026-09-20T08:15:00.000Z");
assert.equal(roundTripped.status, "ACKNOWLEDGED");
assert.equal(roundTripped.version, 4);
assert.equal(roundTripped.createdAt, populated.createdAt);
assert.equal(roundTripped.createdBy, populated.createdBy);
assert.equal(roundTripped.updatedAt, populated.updatedAt);
assert.equal(roundTripped.updatedBy, populated.updatedBy);
assert.deepEqual(reportToRow(roundTripped), row, "row -> entity -> row is stable");

// 4. Backward compatibility: a blank ReportType resolves to GENERAL.
const legacyRow = reportToRow({ ...populated, reportType: "GENERAL", consentConfirmed: false });
legacyRow[columnOf("ReportType")] = "";
assert.equal(reportFromRow(legacyRow).reportType, "GENERAL", "blank ReportType resolves to GENERAL");
assert.equal(reportFromRow(legacyRow).consentConfirmed, false, "NO resolves to false");

// 5. Short or blank historical rows are padded, never misaligned.
const empty = reportFromRow([]);
assert.equal(empty.reportType, "GENERAL");
assert.equal(empty.status, "DRAFT");
assert.equal(empty.version, 0);
assert.equal(empty.signatureSize, 0);
assert.equal(empty.pdfGenerationStatus, "NONE");
assert.equal(reportFromRow(["SR-2"]).serviceReportId, "SR-2");

// ServiceInvoices reference columns — the mapping that decides whether a Service
// Invoice may create a Service Report and which report it opens.
assert.equal(SERVICE_INVOICES_ROW_WIDTH, 16, "ServiceInvoices is A:P (16 columns)");

const invoiceRow = (over: Record<number, string> = {}): string[] => {
  const row = Array.from({ length: SERVICE_INVOICES_ROW_WIDTH }, () => "");
  row[0] = "1593";
  row[2] = "CMP-1";
  for (const [index, value] of Object.entries(over)) row[Number(index)] = value;
  return row;
};

// M/N = assigned technician, O/P = Service Report link.
const linked = invoiceCoarseFromRow(invoiceRow({ 12: "tech-1", 13: "Tech One", 14: "report-1", 15: "DRAFT" }));
assert.equal(linked.invoiceNo, "1593");
assert.equal(linked.assignedTechnicianUserId, "tech-1");
assert.equal(linked.assignedTechnicianName, "Tech One");
assert.equal(linked.serviceReportId, "report-1");
assert.equal(linked.serviceReportStatus, "DRAFT");

// A technician with no report yet: no link, so the UI may create one.
const unlinked = invoiceCoarseFromRow(invoiceRow({ 12: "tech-2", 13: "Tech Two" }));
assert.equal(unlinked.assignedTechnicianUserId, "tech-2");
assert.equal(unlinked.serviceReportId, "");
assert.equal(unlinked.serviceReportStatus, "");
assert.equal(invoiceCoarseFromRow([]).serviceReportId, "", "a short row is padded, never misaligned");
assert.equal(invoiceCoarseFromRow([]).assignedTechnicianUserId, "");

console.log("service-report mapper/schema tests passed");



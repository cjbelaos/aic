// ServiceReports tab row mapping — pure module.
//
// Column order is the canonical 34-column ServiceReports order (A:AH) declared
// in ./constants.ts. The sheet header for the domain field `customerId` is
// `CompanyId`.
//
// Pure module: imported by ./repository (which re-exports it for the write layer
// and the reads) and directly by the focused Node tests, which run the compiled
// output without the Next.js "@/" path alias. Never import Google or node-only
// APIs here.

import type { ServiceReport } from "../../types/serviceReport.ts";
import { SERVICE_REPORTS_ROW_WIDTH } from "./constants.ts";
import { parseSheetNumber } from "../../lib/sheets.utils.ts";

export function reportFromRow(row: unknown[]): ServiceReport {
  const width = SERVICE_REPORTS_ROW_WIDTH; // 34 → A:AH
  const r = row.length >= width ? row : [...row, ...Array<unknown>(width - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  const num = (value: unknown): number => parseSheetNumber(value);
  return {
    serviceReportId: text(r[0]),
    serviceReportNo: text(r[1]),
    // Blank historical rows resolve to GENERAL (backward compatibility).
    reportType: (text(r[2]) || "GENERAL") as ServiceReport["reportType"],
    serviceInvoiceNo: text(r[3]),
    customerId: text(r[4]), // sheet header: CompanyId
    companyNameSnapshot: text(r[5]),
    clientNameSnapshot: text(r[6]),
    clientAddressSnapshot: text(r[7]),
    assignedTechnicianUserId: text(r[8]),
    assignedTechnicianNameSnapshot: text(r[9]),
    serviceDate: text(r[10]),
    serviceType: text(r[11]),
    fieldReport: text(r[12]),
    remarks: text(r[13]),
    acknowledgedByFullName: text(r[14]),
    acknowledgedByPosition: text(r[15]),
    acknowledgmentTextVersion: text(r[16]),
    consentConfirmed: String(text(r[17])).toUpperCase() === "YES",
    signatureDriveFileId: text(r[18]),
    signatureUrl: text(r[19]),
    signatureSha256: text(r[20]),
    signatureMimeType: text(r[21]),
    signatureSize: num(r[22]),
    signedAt: text(r[23]),
    status: (text(r[24]) || "DRAFT") as ServiceReport["status"],
    version: num(r[25]),
    pdfDriveFileId: text(r[26]),
    pdfUrl: text(r[27]),
    pdfGenerationStatus: (text(r[28]) || "NONE") as ServiceReport["pdfGenerationStatus"],
    voidReason: text(r[29]),
    createdAt: text(r[30]),
    createdBy: text(r[31]),
    updatedAt: text(r[32]),
    updatedBy: text(r[33]),
  };
}

/** Emits exactly SERVICE_REPORTS_ROW_WIDTH (34) cells in the A:AH order. */
export function reportToRow(report: ServiceReport): (string | number)[] {
  return [
    report.serviceReportId, // 0  A
    report.serviceReportNo, // 1  B
    report.reportType, // 2  C
    report.serviceInvoiceNo, // 3  D
    report.customerId, // 4  E  CompanyId
    report.companyNameSnapshot, // 5  F
    report.clientNameSnapshot, // 6  G
    report.clientAddressSnapshot, // 7  H
    report.assignedTechnicianUserId, // 8  I
    report.assignedTechnicianNameSnapshot, // 9  J
    report.serviceDate, // 10 K
    report.serviceType, // 11 L
    report.fieldReport, // 12 M
    report.remarks, // 13 N
    report.acknowledgedByFullName, // 14 O
    report.acknowledgedByPosition, // 15 P
    report.acknowledgmentTextVersion, // 16 Q
    report.consentConfirmed ? "YES" : "NO", // 17 R
    report.signatureDriveFileId, // 18 S
    report.signatureUrl, // 19 T
    report.signatureSha256, // 20 U
    report.signatureMimeType, // 21 V
    String(report.signatureSize), // 22 W
    report.signedAt, // 23 X
    report.status, // 24 Y
    String(report.version), // 25 Z
    report.pdfDriveFileId, // 26 AA
    report.pdfUrl, // 27 AB
    report.pdfGenerationStatus, // 28 AC
    report.voidReason, // 29 AD
    report.createdAt, // 30 AE
    report.createdBy, // 31 AF
    report.updatedAt, // 32 AG
    report.updatedBy, // 33 AH
  ];
}

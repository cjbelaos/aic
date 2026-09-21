// ServiceInvoices row -> coarse invoice mapping — pure module.
//
// Column layout (16 columns, A:P) — must match the live sheet exactly:
//   A InvoiceNo          B Date            C CustomerId     D PreparedBy
//   E CreatedBy          F CreatedAt       G UpdatedBy      H UpdatedAt
//   I Status             J DriveFileLink   K ContractId     L DRNo
//   M AssignedTechnicianUserId             N AssignedTechnicianName
//   O ServiceReportId                      P ServiceReportStatus
//
// M/N are the assigned technician (the single identity that performs the
// services); O/P are the Service Report link. Never insert, rename or reorder a
// column: this mapper reads by position.
//
// Pure module: imported by ./repository (which re-exports it) and directly by the
// focused Node tests, which run the compiled output without the Next.js "@/" path
// alias. Never import Google or node-only APIs here.

import type { ServiceInvoiceCoarseRow } from "../../types/serviceReport.ts";
import { SERVICE_INVOICES_ROW_WIDTH } from "./constants.ts";

export function invoiceCoarseFromRow(row: unknown[]): ServiceInvoiceCoarseRow {
  const width = SERVICE_INVOICES_ROW_WIDTH; // 16 → A:P
  const r = row.length >= width ? row : [...row, ...Array<unknown>(width - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  return {
    invoiceNo: text(r[0]),
    customerId: text(r[2]),
    companyName: text(r[0]),
    address: "",
    assignedTechnicianUserId: text(r[12]), // M
    assignedTechnicianName: text(r[13]), // N
    serviceReportId: text(r[14]), // O
    serviceReportStatus: text(r[15]), // P
  };
}

// Service Reports — Google Sheets repository (READ layer + column contract).
// Reads are direct and stateless; mutations go through the writer glue which
// enforces version guards, command receipts and the sequence lease. This module
// owns the tab <-> entity mappers shared with the schema verification script.

import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { parseSheetNumber } from "@/lib/sheets.utils";
import { getCompanies } from "@/lib/companySheets";
import type {
  ServiceReport,
  ServiceReportHistoryEvent,
  ServiceReportCommandReceipt,
  ServiceReportSequence,
  ServiceInvoiceCoarseRow,
  WaterTreatmentServiceReportDetails,
} from "@/types/serviceReport";
import {
  SERVICE_REPORTS_TAB,
  WATER_TREATMENT_DETAILS_TAB,
  SERVICE_REPORTS_HISTORY_TAB,
  SERVICE_REPORTS_SEQUENCES_TAB,
  SERVICE_REPORTS_COMMANDS_TAB,
  SERVICE_INVOICES_TAB,
  SERVICE_INVOICES_APPENDED_HEADERS,
  SERVICE_REPORTS_HEADERS,
  WATER_TREATMENT_DETAILS_HEADERS,
  SERVICE_REPORTS_HISTORY_HEADERS,
  SERVICE_REPORTS_SEQUENCES_HEADERS,
  SERVICE_REPORTS_COMMANDS_HEADERS,
} from "./constants";
import {
  waterTreatmentDetailsFromRow,
  waterTreatmentDetailsToRow,
} from "./waterTreatmentDetails";

// Row <-> entity mappers for the canonical 34-column ServiceReports schema live
// in the pure ./reportRow module (no Google or node-only imports) so focused
// Node tests can round-trip them directly. They are re-exported here because the
// write layer (./writer) and the reads below import them from the repository.
import { reportFromRow, reportToRow } from "./reportRow";

export { reportFromRow, reportToRow };
export function historyFromRow(row: unknown[]): ServiceReportHistoryEvent {
  const r = row.length >= 10 ? row : [...row, ...Array<unknown>(10 - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  return {
    eventId: text(r[0]),
    serviceReportId: text(r[1]),
    eventType: text(r[2]),
    fromStatus: text(r[3]),
    toStatus: text(r[4]),
    changedFieldsJson: text(r[5]),
    reason: text(r[6]),
    commandId: text(r[7]),
    actorUserId: text(r[8]),
    createdAt: text(r[9]),
  };
}

export function historyToRow(event: ServiceReportHistoryEvent): string[] {
  return [
    event.eventId,
    event.serviceReportId,
    event.eventType,
    event.fromStatus,
    event.toStatus,
    event.changedFieldsJson,
    event.reason,
    event.commandId,
    event.actorUserId,
    event.createdAt,
  ];
}

export function sequenceFromRow(row: unknown[]): ServiceReportSequence {
  const r = row.length >= 5 ? row : [...row, ...Array<unknown>(5 - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  return {
    sequenceKey: text(r[0]),
    prefix: text(r[1]),
    businessYear: text(r[2]),
    lastNumber: parseSheetNumber(r[3]),
    updatedAt: text(r[4]),
  };
}

export function sequenceToRow(sequence: ServiceReportSequence): string[] {
  return [
    sequence.sequenceKey,
    sequence.prefix,
    sequence.businessYear,
    String(sequence.lastNumber),
    sequence.updatedAt,
  ];
}
function tabEndColumn(tabName: string): string {
  switch (tabName) {
    case SERVICE_REPORTS_TAB:
      return headerEndColumn(SERVICE_REPORTS_HEADERS.length); // 34 → AH
    case WATER_TREATMENT_DETAILS_TAB:
      return headerEndColumn(WATER_TREATMENT_DETAILS_HEADERS.length); // 89 → CK
    case SERVICE_REPORTS_HISTORY_TAB:
      return headerEndColumn(SERVICE_REPORTS_HISTORY_HEADERS.length); // J
    case SERVICE_REPORTS_SEQUENCES_TAB:
      return headerEndColumn(SERVICE_REPORTS_SEQUENCES_HEADERS.length); // E
    case SERVICE_REPORTS_COMMANDS_TAB:
      return headerEndColumn(SERVICE_REPORTS_COMMANDS_HEADERS.length); // H
    default:
      return headerEndColumn(SERVICE_REPORTS_HEADERS.length);
  }
}

async function readTabValues(tabName: string): Promise<unknown[][]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabName}!A2:${tabEndColumn(tabName)}` });
  return response.data.values ?? [];
}

export async function readWaterTreatmentDetails(serviceReportId: string): Promise<WaterTreatmentServiceReportDetails | null> {
  const rows = await readTabValues(WATER_TREATMENT_DETAILS_TAB);
  const wanted = String(serviceReportId ?? "").trim();
  const row = rows.find((candidate) => String(candidate[0] ?? "").trim() === wanted);
  return row ? waterTreatmentDetailsFromRow(row) : null;
}

export async function readServiceReports(): Promise<ServiceReport[]> {
  return (await readTabValues(SERVICE_REPORTS_TAB)).map(reportFromRow).filter((report) => report.serviceReportId);
}

export async function readServiceReportById(serviceReportId: string): Promise<ServiceReport | null> {
  return (await readServiceReports()).find((report) => report.serviceReportId === serviceReportId) ?? null;
}

export async function findServiceReportByInvoiceNo(invoiceNo: string): Promise<ServiceReport | null> {
  const wanted = String(invoiceNo ?? "").trim().toLowerCase();
  return (await readServiceReports()).find(
    (report) => report.serviceInvoiceNo.trim().toLowerCase() === wanted && report.status !== "VOID",
  ) ?? null;
}

export async function readServiceReportHistory(serviceReportId: string): Promise<ServiceReportHistoryEvent[]> {
  return (await readTabValues(SERVICE_REPORTS_HISTORY_TAB)).map(historyFromRow).filter((event) => event.serviceReportId === serviceReportId && event.eventId);
}

export async function readServiceReportCommands(): Promise<ServiceReportCommandReceipt[]> {
  return (await readTabValues(SERVICE_REPORTS_COMMANDS_TAB)).map(commandFromRow).filter((receipt) => receipt.commandId);
}

export async function readServiceReportSequences(): Promise<ServiceReportSequence[]> {
  return (await readTabValues(SERVICE_REPORTS_SEQUENCES_TAB)).map(sequenceFromRow).filter((sequence) => sequence.sequenceKey);
}

/** Reads ServiceInvoices rows and enriches them with company name/address. */
export async function listServiceInvoiceRows(): Promise<ServiceInvoiceCoarseRow[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_INVOICES_TAB}!A2:R`,
  });
  const rows = (response.data.values ?? [])
    .map(invoiceCoarseFromRow)
    .filter((row) => row.invoiceNo);
  const companies = await getCompanies().catch(() => []);
  const reports = await readServiceReports().catch(() => []);
  const typeByReportId = new Map(
    reports.filter((report) => report.status !== "VOID").map((report) => [report.serviceReportId, report.reportType]),
  );
  return rows.map((row) => {
    const company = companies.find((c) => c.companyId === row.customerId || c.id === row.customerId);
    return {
      ...row,
      companyName: company?.companyName || row.companyName,
      address: company?.address || "",
      reportType: row.serviceReportId ? typeByReportId.get(row.serviceReportId) ?? "" : "",
    };
  });
}

export interface HeaderVerificationResult {
  tab: string;
  missing: string[];
  unexpected: string[];
  ok: boolean;
}

function headerEndColumn(count: number): string {
  let label = "";
  let n = count - 1;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Read-only provisioning gate for the five Service Report tabs and the four
 * appended ServiceInvoices columns. Never writes to the spreadsheet.
 * Headers must match by name AND order AND exact width.
 */
export async function verifyServiceReportHeaders(): Promise<HeaderVerificationResult[]> {
  const tabs: Array<{ tab: string; headers: readonly string[] }> = [
    { tab: SERVICE_REPORTS_TAB, headers: SERVICE_REPORTS_HEADERS },
    { tab: WATER_TREATMENT_DETAILS_TAB, headers: WATER_TREATMENT_DETAILS_HEADERS },
    { tab: SERVICE_REPORTS_HISTORY_TAB, headers: SERVICE_REPORTS_HISTORY_HEADERS },
    { tab: SERVICE_REPORTS_SEQUENCES_TAB, headers: SERVICE_REPORTS_SEQUENCES_HEADERS },
    { tab: SERVICE_REPORTS_COMMANDS_TAB, headers: SERVICE_REPORTS_COMMANDS_HEADERS },
  ];
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const results: HeaderVerificationResult[] = [];
  for (const { tab, headers } of tabs) {
    const end = headerEndColumn(headers.length);
    let actual: string[] = [];
    try {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:${end}1` });
      actual = (response.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
    } catch {
      results.push({ tab, missing: [...headers], unexpected: [], ok: false });
      continue;
    }
    const missing: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      if (actual[i] !== headers[i]) {
        missing.push(i >= actual.length
          ? `<col ${i + 1} missing: ${headers[i]}>`
          : `<col ${i + 1} expected "${headers[i]}", found "${actual[i]}">`);
      }
    }
    const unexpected = actual.length > headers.length
      ? actual.slice(headers.length).map((cell, index) => `<col ${headers.length + index + 1} unexpected "${cell}">`)
      : [];
    results.push({ tab, missing, unexpected, ok: missing.length === 0 && unexpected.length === 0 });
  }

  // ServiceInvoices appended columns: O..R must exist (and be the trailing cells).
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_TAB}!O1:R1` });
    const actual = (response.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
    const missing = SERVICE_INVOICES_APPENDED_HEADERS.filter((expected) => !actual.includes(expected));
    const unexpected = actual.filter((cell) => !SERVICE_INVOICES_APPENDED_HEADERS.includes(cell));
    results.push({ tab: `${SERVICE_INVOICES_TAB} (appended O:R)`, missing, unexpected, ok: missing.length === 0 && unexpected.length === 0 });
  } catch {
    results.push({
      tab: `${SERVICE_INVOICES_TAB} (appended O:R)`,
      missing: [...SERVICE_INVOICES_APPENDED_HEADERS],
      unexpected: [],
      ok: false,
    });
  }
  return results;
}

export async function assertServiceReportHeadersReady(): Promise<void> {
  const results = await verifyServiceReportHeaders();
  const problems = results.filter((result) => !result.ok);
  if (problems.length > 0) {
    const detail = problems.map((p) => `${p.tab}: missing=[${p.missing.join(",")}]`).join("; ");
    throw new Error(`Service Report tabs are not provisioned: ${detail}`);
  }
}

export function commandFromRow(row: unknown[]): ServiceReportCommandReceipt {
  const r = row.length >= 8 ? row : [...row, ...Array<unknown>(8 - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  return {
    commandId: text(r[0]),
    payloadHash: text(r[1]),
    commandType: text(r[2]),
    serviceReportId: text(r[3]),
    resultVersion: parseSheetNumber(r[4]),
    resultJson: text(r[5]),
    committedAt: text(r[6]),
    actorUserId: text(r[7]),
  };
}

export function commandToRow(receipt: ServiceReportCommandReceipt): string[] {
  return [
    receipt.commandId,
    receipt.payloadHash,
    receipt.commandType,
    receipt.serviceReportId,
    String(receipt.resultVersion),
    receipt.resultJson,
    receipt.committedAt,
    receipt.actorUserId,
  ];
}

export function invoiceCoarseFromRow(row: unknown[]): ServiceInvoiceCoarseRow {
  const r = row.length >= 18 ? row : [...row, ...Array<unknown>(18 - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  return {
    invoiceNo: text(r[0]),
    customerId: text(r[2]),
    companyName: text(r[0]),
    address: "",
    // For Service Reports, the invoice's Delivered By identity is the
    // assigned technician. M/N are the canonical, server-resolved user
    // snapshot and therefore remain correct for invoices linked to a DR too.
    assignedTechnicianUserId: text(r[12]),
    assignedTechnicianName: text(r[13]),
    serviceReportId: text(r[16]),
    serviceReportStatus: text(r[17]),
  };
}

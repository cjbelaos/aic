// Service Reports — Google Sheets write layer. Every write is tuned for the
// version-guard and idempotency contracts used by the orchestration service.
// Writes that must be concurrency-safe (report-number allocation) are mediated
// by sequences.ts over the lock cells below.

import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  ServiceReport,
  ServiceReportHistoryEvent,
  ServiceReportCommandReceipt,
  ServiceReportSequence,
  WaterTreatmentServiceReportDetails,
} from "@/types/serviceReport";
import {
  SERVICE_REPORTS_TAB,
  WATER_TREATMENT_DETAILS_TAB,
  SERVICE_REPORTS_HISTORY_TAB,
  SERVICE_REPORTS_SEQUENCES_TAB,
  SERVICE_REPORTS_COMMANDS_TAB,
  SERVICE_REPORTS_ROW_WIDTH,
  WATER_TREATMENT_DETAILS_ROW_WIDTH,
} from "./constants";
import { findServiceReportByInvoiceNo } from "./repository";
import {
  reportFromRow,
  reportToRow,
  historyToRow,
  commandToRow,
  sequenceToRow,
} from "./repository";
import { waterTreatmentDetailsToRow } from "./waterTreatmentDetails";
import { duplicate, versionConflict, dependencyUnavailable } from "./errors";

const REPORTS_RANGE = `${SERVICE_REPORTS_TAB}!A2:AH`; // 34 columns
const WATER_TREATMENT_DETAILS_RANGE = `${WATER_TREATMENT_DETAILS_TAB}!A2:CK`; // 89 columns
const HISTORY_RANGE = `${SERVICE_REPORTS_HISTORY_TAB}!A2:J`;
const COMMANDS_RANGE = `${SERVICE_REPORTS_COMMANDS_TAB}!A2:H`;
const SEQUENCES_RANGE = `${SERVICE_REPORTS_SEQUENCES_TAB}!A2:E`;
// Lease cells live to the right of the 5-column sequence table (not headers).
const LOCK_RANGE = `${SERVICE_REPORTS_SEQUENCES_TAB}!G1:I1`;

const text = (value: unknown): string => String(value ?? "").trim();

/** Defensive guard: a row with the wrong width would corrupt the tab columns. */
function assertRowWidth(row: unknown[], expected: number, label: string): void {
  if (row.length !== expected) {
    throw dependencyUnavailable(`${label} row width is ${row.length}; expected ${expected} columns. Update the sheet headers before saving.`);
  }
}

export async function createServiceReport(report: ServiceReport): Promise<void> {
  assertRowWidth(reportToRow(report), SERVICE_REPORTS_ROW_WIDTH, "ServiceReports");
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  // One active report per invoice: the authoritative row set decides.
  const existing = report.serviceInvoiceNo ? await findServiceReportByInvoiceNo(report.serviceInvoiceNo) : null;
  if (existing) {
    throw duplicate(
      `A Service Report already exists for invoice ${report.serviceInvoiceNo}. Open the existing report instead of creating a duplicate.`,
    );
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: REPORTS_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [reportToRow(report)] },
  });
}

async function findReportRowIndex(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  serviceReportId: string,
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: REPORTS_RANGE });
  const rows = response.data.values ?? [];
  const index = rows.findIndex((row) => text(row[0]) === serviceReportId);
  return index; // -1 when missing; data row n sits at spreadsheet row n+2
}

export async function updateServiceReport(
  report: ServiceReport,
  expectedVersion: number,
): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowIndex = await findReportRowIndex(sheets, spreadsheetId, report.serviceReportId);
  if (rowIndex < 0) {
    throw dependencyUnavailable(`Service Report ${report.serviceReportId} was not found while saving.`);
  }
  const current = reportFromRow((await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_REPORTS_TAB}!A${rowIndex + 2}:AH${rowIndex + 2}`,
  })).data.values?.[0] ?? []);
  if (current.version !== expectedVersion) {
    throw versionConflict(
      `This report was changed by another save (expected version ${expectedVersion}, current version ${current.version}).`,
      current.version,
    );
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SERVICE_REPORTS_TAB}!A${rowIndex + 2}:AH${rowIndex + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [reportToRow(report)] },
  });
}

/** Compensation: removes a freshly-created parent row (best effort). */
export async function deleteServiceReport(serviceReportId: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowIndex = await findReportRowIndex(sheets, spreadsheetId, serviceReportId);
  if (rowIndex < 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId: 0, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }],
    },
  });
}

async function findWaterTreatmentDetailsRowIndex(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  serviceReportId: string,
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: WATER_TREATMENT_DETAILS_RANGE });
  const rows = response.data.values ?? [];
  return rows.findIndex((row) => text(row[0]) === serviceReportId);
}

/** Exactly one detail row per WATER_TREATMENT report (idempotent by ServiceReportId). */
export async function upsertWaterTreatmentDetails(details: WaterTreatmentServiceReportDetails): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowIndex = await findWaterTreatmentDetailsRowIndex(sheets, spreadsheetId, details.serviceReportId);
  const asRow = waterTreatmentDetailsToRow(details);
  assertRowWidth(asRow, WATER_TREATMENT_DETAILS_ROW_WIDTH, WATER_TREATMENT_DETAILS_TAB);
  if (rowIndex < 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: WATER_TREATMENT_DETAILS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [asRow] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${WATER_TREATMENT_DETAILS_TAB}!A${rowIndex + 2}:CK${rowIndex + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [asRow] },
  });
}

/** Compensation: removes the detail row (best effort). */
export async function deleteWaterTreatmentDetails(serviceReportId: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowIndex = await findWaterTreatmentDetailsRowIndex(sheets, spreadsheetId, serviceReportId);
  if (rowIndex < 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId: 1, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }],
    },
  });
}

export async function appendServiceReportHistory(event: ServiceReportHistoryEvent): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: HISTORY_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [historyToRow(event)] },
  });
}

export async function saveServiceReportCommand(receipt: ServiceReportCommandReceipt): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: COMMANDS_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [commandToRow(receipt)] },
  });
// ── Sequences ────────────────────────────────────────────────────
}

export async function readServiceReportSequence(businessYear: string): Promise<ServiceReportSequence | null> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: SEQUENCES_RANGE });
  const wantedKey = `AIC-SR-${businessYear}`;
  const row = (response.data.values ?? []).find((candidate) => text(candidate[0]) === wantedKey);
  if (!row) return null;
  return {
    sequenceKey: text(row[0]),
    prefix: text(row[1]),
    businessYear: text(row[2]),
    lastNumber: Number.parseInt(String(row[3] ?? "0"), 10) || 0,
    updatedAt: text(row[4]),
  };
}

export async function writeServiceReportSequence(sequence: ServiceReportSequence): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_REPORTS_SEQUENCES_TAB}!A2:A` });
  const keys = (response.data.values ?? []).map((row) => text(row[0]));
  const index = keys.findIndex((key) => key === sequence.sequenceKey);
  const asRow = sequenceToRow(sequence);
  if (index < 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SEQUENCES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [asRow] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SERVICE_REPORTS_SEQUENCES_TAB}!A${index + 2}:E${index + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [asRow] },
  });
}

export async function readServiceReportLock(): Promise<{ token: string; expiresAt: string; owner: string }> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: LOCK_RANGE });
  const row = response.data.values?.[0] ?? [];
  return { token: text(row[0]), expiresAt: text(row[1]), owner: text(row[2]) };
}

export async function writeServiceReportLock(token: string, expiresAt: string, owner: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: LOCK_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[token, expiresAt, owner]] },
  });
}

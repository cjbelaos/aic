import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  ScheduleEntry,
  CreateSchedulePayload,
  UpdateSchedulePayload,
  FTILinkOption,
} from "@/types/schedule";

const SCHEDULE_SHEET = "ScheduleCalendar";
// A=id, B=controlNo, C=detailId, D=date, E=technician, F=customerName,
// G=description, H=ftiStatus, I=deliveryReportLink, J=serviceInvoiceLink,
// K=dateCreated, L=updatedAt
const RANGE = `${SCHEDULE_SHEET}!A2:L`;

function formatPhilippineTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function generateUUID(): string {
  return crypto.randomUUID();
}

/** Map sheet rows to ScheduleEntry objects. */
function mapRow(row: unknown[]): ScheduleEntry {
  return {
    id: (row[0] || "").toString().trim(),
    controlNo: (row[1] || "").toString().trim(),
    detailId: (row[2] || "").toString().trim(),
    date: (row[3] || "").toString().trim(),
    technician: (row[4] || "").toString().trim(),
    customerName: (row[5] || "").toString().trim(),
    description: (row[6] || "").toString().trim(),
    ftiStatus: (row[7] || "").toString().trim(),
    deliveryReportLink: (row[8] || "").toString().trim() || undefined,
    serviceInvoiceLink: (row[9] || "").toString().trim() || undefined,
    dateCreated: (row[10] || "").toString().trim(),
    updatedAt: (row[11] || "").toString().trim() || undefined,
  };
}

async function getSheetId(sheetName: string): Promise<number> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find(
    (entry) => entry.properties?.title === sheetName,
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet "${sheetName}" not found or has invalid ID.`);
  }
  return sheetId;
}

/** Read all schedule entries from the Sheet. */
export async function getAllScheduleEntries(): Promise<ScheduleEntry[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });
    const rows = res.data.values || [];
    return rows.map(mapRow).filter((e) => e.id && e.customerName);
  } catch (error) {
    console.error("Failed to fetch schedule entries:", error);
    throw error;
  }
}

/** Create a new schedule entry row. */
export async function addScheduleEntry(
  payload: CreateSchedulePayload,
): Promise<ScheduleEntry> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const now = formatPhilippineTimestamp();
    // Reuse detailId if the same FTI detail is being re-linked, so we can
    // merge rather than duplicate.
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });
    const rows = res.data.values || [];
    const existingIdx = rows.findIndex(
      (row) =>
        (row[2] || "").toString().trim() === (payload.detailId || "") &&
        (row[2] || "").toString().trim() !== "",
    );

    const entry: ScheduleEntry = {
      id: generateUUID(),
      controlNo: payload.controlNo,
      detailId: payload.detailId || "",
      date: payload.date,
      technician: payload.technician,
      customerName: payload.customerName,
      description: payload.description || "",
      ftiStatus: payload.ftiStatus || "",
      deliveryReportLink: payload.deliveryReportLink,
      serviceInvoiceLink: payload.serviceInvoiceLink,
      dateCreated: now,
    };

    if (existingIdx >= 0) {
      // Merge: update the existing row instead of appending a duplicate.
      const rowNumber = existingIdx + 2;
      const updated = {
        ...mapRow(rows[existingIdx]),
        ...entry,
        deliveryReportLink:
          entry.deliveryReportLink ||
          (rows[existingIdx][8] || "").toString().trim() ||
          undefined,
        serviceInvoiceLink:
          entry.serviceInvoiceLink ||
          (rows[existingIdx][9] || "").toString().trim() ||
          undefined,
      };
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SCHEDULE_SHEET}!A${rowNumber}:L${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            [
              updated.id,
              updated.controlNo,
              updated.detailId,
              updated.date,
              updated.technician,
              updated.customerName,
              updated.description,
              updated.ftiStatus,
              updated.deliveryReportLink || "",
              updated.serviceInvoiceLink || "",
              updated.dateCreated,
              formatPhilippineTimestamp(),
            ],
          ],
        },
      });
      return updated;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SCHEDULE_SHEET}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            entry.id,
            entry.controlNo,
            entry.detailId,
            entry.date,
            entry.technician,
            entry.customerName,
            entry.description,
            entry.ftiStatus,
            entry.deliveryReportLink || "",
            entry.serviceInvoiceLink || "",
            entry.dateCreated,
            "",
          ],
        ],
      },
    });
    return entry;
  } catch (error) {
    console.error("Failed to create schedule entry:", error);
    throw error;
  }
}

/** Update an existing schedule entry by id. */
export async function updateScheduleEntryInSheets(
  id: string,
  payload: UpdateSchedulePayload,
): Promise<ScheduleEntry> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex(
      (row) => (row[0] || "").toString().trim() === id,
    );
    if (idx === -1) throw new Error(`Schedule entry ${id} not found`);
    const rowNumber = idx + 2;
    const existing = mapRow(rows[idx]);
    const updated: ScheduleEntry = {
      ...existing,
      controlNo: payload.controlNo ?? existing.controlNo,
      detailId: payload.detailId ?? existing.detailId,
      date: payload.date ?? existing.date,
      technician: payload.technician ?? existing.technician,
      customerName: payload.customerName ?? existing.customerName,
      description: payload.description ?? existing.description,
      ftiStatus: payload.ftiStatus ?? existing.ftiStatus,
      deliveryReportLink:
        payload.deliveryReportLink ?? existing.deliveryReportLink,
      serviceInvoiceLink:
        payload.serviceInvoiceLink ?? existing.serviceInvoiceLink,
    };
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SCHEDULE_SHEET}!A${rowNumber}:L${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            updated.id,
            updated.controlNo,
            updated.detailId,
            updated.date,
            updated.technician,
            updated.customerName,
            updated.description,
            updated.ftiStatus,
            updated.deliveryReportLink || "",
            updated.serviceInvoiceLink || "",
            updated.dateCreated,
            formatPhilippineTimestamp(),
          ],
        ],
      },
    });
    return updated;
  } catch (error) {
    console.error(`Failed to update schedule entry ${id}:`, error);
    throw error;
  }
}

/** Delete a schedule entry by id (physically removes the row). */
export async function deleteScheduleEntryFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex(
      (row) => (row[0] || "").toString().trim() === id,
    );
    if (idx === -1) return; // already gone
    const rowNumber = idx + 2;
    const sheetId = await getSheetId(SCHEDULE_SHEET);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error(`Failed to delete schedule entry ${id}:`, error);
    throw error;
  }
}

/**
 * Build FTI link options for the event modal. Uses the same join as
 * getAllFTIEntries so the calendar only surfaces real technician+date rows.
 */
export async function getFTILinkOptions(): Promise<FTILinkOption[]> {
  const { getAllFTIEntries } = await import("@/lib/ftiSheets");
  const entries = await getAllFTIEntries();
  return entries
    .filter((e) => e.technician && e.date && e.itinerary)
    .map((e) => ({
      controlNo: e.ftiRef,
      detailId: e.ftiRef, // FTIDetails has no exposed detailId in the flattened view
      date: e.date,
      technician: e.technician,
      customerName: e.itinerary,
      description: e.description,
      status: e.status,
    }));
}

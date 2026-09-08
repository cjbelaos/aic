import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";

/**
 * Payload for a field work log submission (from the mobile app).
 */
export interface FieldWorkLogInput {
  date: string;
  customer: string;
  workDescription: string;
  timeStart: string;
  timeEnd: string;
  customerRep: string;
  customerSignature: string; // Base64 data string or URL
  location?: string;
}

/**
 * A field work log row as persisted in the `FieldWorkLogs` sheet.
 */
export interface FieldWorkLog {
  workLogId: string;
  userId: string;
  date: string;
  customer: string;
  workDescription: string;
  timeStart: string;
  timeEnd: string;
  customerRep: string;
  customerSignature: string;
  location: string;
  createdAt: string;
}

const FIELD_WORK_LOGS_SHEET = "FieldWorkLogs";

// A=workLogId, B=userId, C=date, D=customer, E=workDescription,
// F=timeStart, G=timeEnd, H=customerRep, I=customerSignature, J=location,
// K=createdAt
const FIELD_WORK_LOGS_RANGE = `${FIELD_WORK_LOGS_SHEET}!A2:K`;

/**
 * Format a date in Asia/Manila timezone as `YYYY-MM-DD HH:mm:ss`
 * (same convention used across the other sheet libs, e.g. FTI/liquidation).
 */
function formatTimestamp(date: Date = new Date()): string {
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

function rowToFieldWorkLog(row: string[]): FieldWorkLog {
  return {
    workLogId: (row[0] || "").trim(), // A
    userId: (row[1] || "").trim(), // B
    date: (row[2] || "").trim(), // C
    customer: (row[3] || "").trim(), // D
    workDescription: (row[4] || "").trim(), // E
    timeStart: (row[5] || "").trim(), // F
    timeEnd: (row[6] || "").trim(), // G
    customerRep: (row[7] || "").trim(), // H
    customerSignature: (row[8] || "").trim(), // I
    location: (row[9] || "").trim(), // J
    createdAt: (row[10] || "").trim(), // K
  };
}

/**
 * Appends a field work log to the `FieldWorkLogs` sheet.
 *
 * @param userId User id from the verified JWT (never taken from the body).
 * @param input  The validated work log payload.
 * @returns      The created log including its generated id and timestamp.
 */
export async function createFieldWorkLog(
  userId: string,
  input: FieldWorkLogInput,
): Promise<FieldWorkLog> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const log: FieldWorkLog = {
    workLogId: crypto.randomUUID(), // A
    userId, // B
    date: input.date.trim(), // C
    customer: input.customer.trim(), // D
    workDescription: input.workDescription.trim(), // E
    timeStart: input.timeStart.trim(), // F
    timeEnd: input.timeEnd.trim(), // G
    customerRep: input.customerRep.trim(), // H
    customerSignature: input.customerSignature.trim(), // I
    location: input.location ? String(input.location).trim() : "", // J
    createdAt: formatTimestamp(), // K (YYYY-MM-DD HH:mm:ss)
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: FIELD_WORK_LOGS_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        log.workLogId,
        log.userId,
        log.date,
        log.customer,
        log.workDescription,
        log.timeStart,
        log.timeEnd,
        log.customerRep,
        log.customerSignature,
        log.location,
        log.createdAt,
      ]],
    },
  });

  return log;
}

/**
 * Lists a user's field work logs, newest first.
 */
export async function getFieldWorkLogsByUser(
  userId: string,
  limit = 50,
): Promise<FieldWorkLog[]> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: FIELD_WORK_LOGS_RANGE,
  });

  const logs: FieldWorkLog[] = [];
  for (const row of res.data.values || []) {
    if (String(row[1] ?? "").trim() !== userId) continue;
    logs.push(rowToFieldWorkLog(row));
  }

  // Rows are in append order; reverse so newest submissions come first.
  logs.reverse();
  return logs.slice(0, limit);
}
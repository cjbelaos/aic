import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";

export type AttendanceType = "CLOCK_IN" | "CLOCK_OUT";

const ATTENDANCE_SHEET = "Attendance";

// A=attendanceId, B=userId, C=timestamp, D=type, E=location
const ATTENDANCE_RANGE = `${ATTENDANCE_SHEET}!A2:E`;

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

/**
 * Appends a clock-in / clock-out record to the `Attendance` sheet.
 *
 * @param userId   User id from the JWT (verified by the calling route).
 * @param type     Either "CLOCK_IN" or "CLOCK_OUT".
 * @param location Optional free-text location (lat/lng, JSON, or address).
 */
export async function recordAttendance(
  userId: string,
  type: AttendanceType,
  location?: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: ATTENDANCE_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        crypto.randomUUID(), // A: attendanceId
        userId, // B: userId
        formatTimestamp(), // C: timestamp (YYYY-MM-DD HH:mm:ss)
        type, // D: type
        location ? String(location).trim() : "", // E: location (optional)
      ]],
    },
  });
}
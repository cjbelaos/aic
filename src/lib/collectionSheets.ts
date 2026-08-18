import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  ScheduledCollection,
  CollectionHistory,
  CreateScheduledCollectionPayload,
  LogCollectionPayload,
} from "@/types/collection";

const SCHEDULED_SHEET = "ScheduledCollections"; // Tab for active/pending collections
const SCHEDULED_RANGE = `${SCHEDULED_SHEET}!A2:E`; // Columns: [ID, CompanyId, ScheduledDate, Notes, Status]

const HISTORY_SHEET = "CollectionHistory"; // Tab for completed collections
const HISTORY_RANGE = `${HISTORY_SHEET}!A2:E`; // Columns: [CollectionId, CompanyId, Description, AmountCollected, CollectedDate]

/**
 * Utility helper to extract the raw row number from a ScheduledCollection ID.
 * Example: "sched_5" -> 5
 */
function getRowFromSchedId(id: string): number {
  const rowStr = id.replace("sched_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid ScheduledCollection ID format: ${id}`);
  }
  return rowNum;
}

/* ─────────────────────────────────────────────────────────
   SCHEDULED COLLECTIONS
───────────────────────────────────────────────────────── */

/**
 * GET: Fetches all active/pending scheduled collections from Google Sheets.
 * Filters out rows marked as "COMPLETED" or empty.
 */
export async function getScheduledCollections(): Promise<
  ScheduledCollection[]
> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SCHEDULED_RANGE,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows
      .map((row, index): ScheduledCollection | null => {
        const status = row[4] || "PENDING";

        // Exclude completed or empty company rows from active list
        if (status === "COMPLETED" || !row[1]) {
          return null;
        }

        return {
          id:
            row[0] && row[0].startsWith("sched_")
              ? row[0]
              : `sched_${index + 2}`,
          companyId: row[1] || "",
          companyName: row[1] || "", // Mapped to companyName in UI via companyMap
          scheduledDate: row[2] || "",
          notes: row[3] || "",
          status: status as "PENDING" | "COLLECTED" | "CANCELLED",
        };
      })
      .filter((item): item is ScheduledCollection => item !== null);
  } catch (error) {
    console.error(
      "Failed to fetch scheduled collections from Google Sheets:",
      error,
    );
    throw error;
  }
}

/**
 * POST: Appends a new scheduled collection call to the Google Sheet.
 */
export async function addScheduledCollection(
  payload: CreateScheduledCollectionPayload,
): Promise<ScheduledCollection> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SCHEDULED_RANGE,
    });
    const existingRows = existingResponse.data.values || [];

    const newRowNumber = existingRows.length + 2;
    const customId = `sched_${newRowNumber}`;

    // Layout: [ID, CompanyId, ScheduledDate, Notes, Status]
    const newRowValues = [
      customId,
      payload.companyId || "",
      payload.scheduledDate || "",
      payload.notes || "",
      "PENDING",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SCHEDULED_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: customId,
      companyId: payload.companyId,
      companyName: payload.companyId,
      scheduledDate: payload.scheduledDate,
      notes: payload.notes || "",
      status: "PENDING",
    };
  } catch (error) {
    console.error(
      "Failed to add scheduled collection to Google Sheets:",
      error,
    );
    throw error;
  }
}

/**
 * PATCH / UPDATE STATUS: Updates column E (Status) for a specific schedule row.
 * Handles explicit status updates such as "CANCELLED", "PENDING", or "COMPLETED".
 */
export async function updateScheduledStatus(
  id: string,
  status: "PENDING" | "COLLECTED" | "CANCELLED" | "COMPLETED",
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromSchedId(id);
    const statusCellRange = `${SCHEDULED_SHEET}!E${rowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: statusCellRange,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[status]],
      },
    });
  } catch (error) {
    console.error(
      `Failed to update status for schedule row ${id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

/**
 * DELETE: Clears an entry from the scheduled collection sheet.
 */
export async function deleteScheduledCollectionFromSheets(
  id: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromSchedId(id);
    const deleteRange = `${SCHEDULED_SHEET}!A${rowNumber}:E${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });
  } catch (error) {
    console.error(
      `Failed to clear schedule row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

/* ─────────────────────────────────────────────────────────
   COLLECTION HISTORY
───────────────────────────────────────────────────────── */

/**
 * GET: Fetches all logged collection transactions from Google Sheets.
 */
export async function getCollectionHistory(): Promise<CollectionHistory[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: HISTORY_RANGE,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row, index): CollectionHistory => {
      const rawAmount = String(row[3] || "0").replace(/[₱$,]/g, "");
      return {
        collectionId: row[0] || `COL-${index + 2}`,
        companyId: row[1] || "",
        companyName: row[1] || "",
        description: row[2] || "",
        amountCollected: parseFloat(rawAmount) || 0,
        collectedDate: row[4] || "",
      };
    });
  } catch (error) {
    console.error(
      "Failed to fetch collection history from Google Sheets:",
      error,
    );
    throw error;
  }
}

/**
 * POST / LOG COLLECTION: Appends a transaction to history and
 * updates/marks the scheduled collection as COMPLETED so it gets removed from the schedule view.
 */
export async function logCollectionToSheets(
  payload: LogCollectionPayload,
): Promise<CollectionHistory> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    if (payload.amountCollected <= 0) {
      throw new Error("Amount collected must be greater than 0.");
    }

    const collectionId = `COL-${Date.now()}`;

    // 1. Append to CollectionHistory sheet
    // Layout: [CollectionId, CompanyId, Description, AmountCollected, CollectedDate]
    const historyRowValues = [
      collectionId,
      payload.companyId || "",
      payload.description || "",
      payload.amountCollected || 0,
      payload.collectedDate || "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: HISTORY_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [historyRowValues],
      },
    });

    // 2. Mark the corresponding scheduled item as COMPLETED
    if (payload.scheduledCollectionId) {
      await updateScheduledStatus(payload.scheduledCollectionId, "COMPLETED");
    }

    return {
      collectionId,
      companyId: payload.companyId,
      companyName: payload.companyId,
      description: payload.description,
      amountCollected: payload.amountCollected,
      collectedDate: payload.collectedDate,
    };
  } catch (error) {
    console.error("Failed to log collection entry in Google Sheets:", error);
    throw error;
  }
}

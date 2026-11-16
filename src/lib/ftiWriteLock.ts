import { AsyncLocalStorage } from "node:async_hooks";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";

const owner = new AsyncLocalStorage<{ uncertain: boolean }>();
export const FTI_LOCK_SHEET = "_FTI_WRITE_LOCK";

export class FTIWriteConflict extends Error {
  status = 409;
}

export function isFTIWriteLocked(): boolean {
  return owner.getStore() !== undefined;
}

/** A timed-out remote write may still finish; releasing then would allow overlapping writes. */
export function isUncertainFTIWrite(error: unknown): boolean {
  const failure = error as { code?: string; name?: string; config?: { method?: string }; response?: { status?: number } } | null;
  if (!failure) return false;
  const method = failure.config?.method?.toUpperCase();
  if (method && ["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "EPIPE"].includes(failure.code || "") || ["AbortError", "TimeoutError"].includes(failure.name || "")) return true;
  return !!method && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && (!failure.response || (failure.response.status ?? 0) >= 500);
}

/** Unique sheet titles coordinate writers across instances without an expiring lease. */
export async function withFTIWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const current = owner.getStore();
  if (current) {
    try { return await work(); }
    catch (error) { current.uncertain ||= isUncertainFTIWrite(error); throw error; }
  }
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  let sheetId: number;
  try {
    const result = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: {
        title: FTI_LOCK_SHEET, hidden: true,
        gridProperties: { rowCount: 1, columnCount: 1 },
      } } }] },
    }, { retry: false });
    const id = result.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (id == null) throw new Error("FTI lock acquisition could not be confirmed.");
    sheetId = id;
  } catch (error) {
    if (/already exists/i.test(error instanceof Error ? error.message : "")) {
      throw new FTIWriteConflict("An FTI update is in progress. Please try again shortly.");
    }
    // Unknown acquisition outcomes deliberately retain the lock. Never steal it on timeout.
    throw error;
  }
  const state = { uncertain: false };
  try {
    return await owner.run(state, work);
  } catch (error) {
    state.uncertain ||= isUncertainFTIWrite(error);
    throw error;
  } finally {
    if (!state.uncertain) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId } }] },
      });
    }
  }
}

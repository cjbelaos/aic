import { AsyncLocalStorage } from "node:async_hooks";
import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";

// Cross-instance write lock for every stock-reducing write (DR saves, transfers,
// negative adjustments, voids). Modelled on src/lib/ftiWriteLock.ts: a uniquely
// named hidden tab is the lock. Unlike the FTI lock it carries its acquisition
// time in A1 (written in the same atomic request) and a lock older than
// STALE_AFTER_MS is taken over, so a crashed writer can never block deliveries.

export const INVENTORY_LOCK_SHEET = "_INVENTORY_WRITE_LOCK";
const STALE_AFTER_MS = 120_000;

const owner = new AsyncLocalStorage<{ uncertain: boolean }>();
let clock: () => number = () => Date.now();

/** Test hook: replaces the clock used for stale-lock detection. */
export function __setClock(next: () => number): void {
  clock = next;
}

// A writer that finds the lock held waits briefly (PDF export inside a DR save
// takes several seconds) before giving up with a 409.
let retry = { attempts: 30, delayMs: 400 };

/** Test hook: replaces the wait-and-retry settings used when the lock is held. */
export function __setRetry(next: { attempts: number; delayMs: number }): void {
  retry = next;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class InventoryWriteConflict extends Error {
  status = 409;
}

export function isInventoryLocked(): boolean {
  return owner.getStore() !== undefined;
}

/** A timed-out remote write may still finish; releasing then would allow overlapping writes. */
function isUncertainWrite(error: unknown): boolean {
  const failure = error as { code?: string; name?: string; config?: { method?: string }; response?: { status?: number } } | null;
  if (!failure) return false;
  const method = failure.config?.method?.toUpperCase();
  if (method && ["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "EPIPE"].includes(failure.code || "") || ["AbortError", "TimeoutError"].includes(failure.name || "")) return true;
  return !!method && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && (!failure.response || (failure.response.status ?? 0) >= 500);
}

type Sheets = Awaited<ReturnType<typeof getSheetsClient>>;

async function tryAcquire(sheets: Sheets, spreadsheetId: string): Promise<number | null> {
  const sheetId = 900_000_000 + Math.floor(Math.random() * 99_999_999);
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [
        { addSheet: { properties: { sheetId, title: INVENTORY_LOCK_SHEET, hidden: true, gridProperties: { rowCount: 1, columnCount: 1 } } } },
        { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, fields: "userEnteredValue", rows: [{ values: [{ userEnteredValue: { stringValue: new Date(clock()).toISOString() } }] }] } },
      ] },
    }, { retry: false });
    return sheetId;
  } catch (error) {
    if (/already exists/i.test(error instanceof Error ? error.message : "")) return null;
    // Unknown acquisition outcomes deliberately retain the lock; it expires on its own.
    throw error;
  }
}

/** Deletes the current lock tab when its timestamp is older than STALE_AFTER_MS. */
async function takeOverIfStale(sheets: Sheets, spreadsheetId: string): Promise<boolean> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const tab = meta.data.sheets?.find((sheet) => sheet.properties?.title === INVENTORY_LOCK_SHEET);
  const staleId = tab?.properties?.sheetId;
  if (staleId == null) return true; // released meanwhile
  const stamp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${INVENTORY_LOCK_SHEET}!A1` });
  const acquiredAt = Date.parse(String(stamp.data.values?.[0]?.[0] ?? ""));
  // A missing timestamp cannot happen (it is written atomically); treat it as stale.
  if (Number.isFinite(acquiredAt) && clock() - acquiredAt <= STALE_AFTER_MS) return false;
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId: staleId } }] } });
  } catch {
    // Another instance removed it first; acquisition below decides.
  }
  return true;
}

export async function withInventoryLock<T>(work: () => Promise<T>): Promise<T> {
  const current = owner.getStore();
  if (current) {
    try { return await work(); }
    catch (error) { current.uncertain ||= isUncertainWrite(error); throw error; }
  }
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  let sheetId = await tryAcquire(sheets, spreadsheetId);
  for (let attempt = 0; sheetId === null; attempt++) {
    if (await takeOverIfStale(sheets, spreadsheetId)) sheetId = await tryAcquire(sheets, spreadsheetId);
    if (sheetId !== null || attempt >= retry.attempts) break;
    await sleep(retry.delayMs);
    sheetId = await tryAcquire(sheets, spreadsheetId);
  }
  if (sheetId === null) {
    throw new InventoryWriteConflict("Another stock update is in progress. Please try again shortly.");
  }
  const state = { uncertain: false };
  try {
    return await owner.run(state, work);
  } catch (error) {
    state.uncertain ||= isUncertainWrite(error);
    throw error;
  } finally {
    if (!state.uncertain) {
      // The write already happened. A failed release must not turn it into an
      // error (the user would retry and create a duplicate); the lock expires
      // on its own after STALE_AFTER_MS.
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ deleteSheet: { sheetId } }] },
        });
      } catch (releaseError) {
        console.error("Inventory lock release failed; it will expire on its own:", releaseError);
      }
    }
  }
}

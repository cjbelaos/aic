import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getAllMiscellaneous } from "@/lib/miscellaneousSheets";
import { getUsers } from "@/lib/userSheets";
import { getCustomers } from "@/lib/customerSheets";
import { EXPRESSWAY_GROUPS } from "@/lib/tollMatrix";
import type {
  FTIRequest,
  FTIDetails,
  FTIExpenses,
  FTILegs,
  FTIDetailInput,
  FTILegsInput,
  FTIRequestFull,
} from "@/types/fti";
import { computeDetailTotal, computeFuelCost } from "@/types/fti";

// ── Constants ──
const FTI_REQUEST_SHEET = "FTIRequests";
const FTI_DETAILS_SHEET = "FTIDetails";
const FTI_EXPENSES_SHEET = "FTIExpenses";
const FTI_LEGS_SHEET = "FTILegs";
const USER_FUEL_PER_KM_SHEET = "UserFuelPerKm";

const RANGE_REQUEST = `${FTI_REQUEST_SHEET}!A2:F`; // A=controlNo, B=userId, C=status, D=dateCreated, E=ftiFileLink
const RANGE_DETAILS = `${FTI_DETAILS_SHEET}!A2:I`; // A=detailId, B=controlNo, C=date, D=itinerary, E=description, F=km, G=fuelPrice, H=fuelSubTotal, I=tollFee
const RANGE_EXPENSES = `${FTI_EXPENSES_SHEET}!A2:D`; // A=expenseId, B=detailId, C=miscCode, D=amount
const RANGE_LEGS = `${FTI_LEGS_SHEET}!A2:I`; // A=legId, B=detailId, C=controlNo, D=originName, E=originAddress, F=destName, G=destAddress, H=tollFee, I=distanceKm
const RANGE_USER_FUEL = `${USER_FUEL_PER_KM_SHEET}!A2:B`; // A=userId, B=KmPerLiter

const TOLL_MATRIX_SHEET = "Toll Matrix Table";

const DEFAULT_KM_PER_LITER = 12;

// ── Simple TTL Cache ──────────────────────────
// Reduces Google Sheets API round-trips for hot reads (list/detail loads).
const cache = new Map<string, { value: unknown; expires: number }>();
const CACHE_TTL_MS = 10_000;
const FUEL_CACHE_TTL_MS = 60_000;

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs: number): void {
  // Prevent unbounded growth
  if (cache.size > 500) {
    for (const [k] of cache) cache.delete(k);
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

function invalidateFTICache(): void {
  for (const [key] of cache) {
    if (
      key.startsWith("fti:requests") ||
      key.startsWith("fti:details") ||
      key.startsWith("fti:expenses") ||
      key.startsWith("fti:legs")
    ) {
      cache.delete(key);
    }
  }
}

// ── Helpers ──

function generateUUID(): string {
  return crypto.randomUUID();
}

/** Format a date in Asia/Manila timezone as `YYYY-MM-DD HH:mm:ss`. */
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

async function deleteSheetRows(
  sheetName: string,
  rowNumbers: number[],
): Promise<void> {
  if (rowNumbers.length === 0) return;
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheetId = await getSheetId(sheetName);
  const sheets = await getSheetsClient();
  const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: sorted.map((rowNumber) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    },
  });
}

async function findRequestRowNumber(controlNo: string): Promise<number> {
  const all = await getAllFTIRequests();
  const idx = all.findIndex((r) => r.controlNo === controlNo);
  if (idx === -1) throw new Error(`FTI request ${controlNo} not found`);
  return idx + 2;
}

export function generateFTIRef(): string {
  const ts = formatPhilippineTimestamp().replace(/[-: ]/g, "");
  return `CTRL-${ts}`;
}

/**
 * Throws if the request is in a locked state (SUBMITTED or APPROVED).
 */
async function guardEditableStatus(controlNo: string): Promise<void> {
  const all = await getAllFTIRequests();
  const req = all.find((r) => r.controlNo === controlNo);
  if (!req) throw new Error(`FTI request ${controlNo} not found`);
  const locked = ["SUBMITTED", "APPROVED"];
  if (locked.includes(req.status.toUpperCase())) {
    throw new Error(
      `Cannot modify request ${controlNo}: status is "${req.status}".`,
    );
  }
}

/**
 * Read KmPerLiter for a user from the UserFuelPerKm sheet.
 * Falls back to DEFAULT_KM_PER_LITER (12) when the user is not listed.
 */
export async function getKmPerLiter(userId: string): Promise<number> {
  if (!userId) return DEFAULT_KM_PER_LITER;
  const cacheKey = `fti:fuel:${userId}`;
  const cached = cacheGet<number>(cacheKey);
  if (cached !== undefined) return cached;

  let value = DEFAULT_KM_PER_LITER;
  try {
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_USER_FUEL,
    });
    const rows = res.data.values || [];
    const row = rows.find((r) => (r[0] || "").toString().trim() === userId);
    if (row) {
      const parsed = parseFloat((row[1] || "").toString().trim());
      if (!isNaN(parsed) && parsed > 0) value = parsed;
    }
  } catch {
    // fall back to default
  }
  cacheSet(cacheKey, value, FUEL_CACHE_TTL_MS);
  return value;
}

/**
 * Compute FuelSubTotal for a detail using the user's KmPerLiter.
 * Formula: (km / kmPerLiter) * fuelPrice
 */
function computeFuelSubTotal(
  km: number,
  fuelPrice: number,
  kmPerLiter: number,
): number {
  return parseFloat(computeFuelCost(km, fuelPrice, kmPerLiter).toFixed(2));
}

// ── Whole-sheet cached readers ────────────────
// Reading each sheet ONCE (cached 10s) and joining in memory avoids the
// N+1 Google Sheets API call pattern that caused rate-limit runtime errors.

async function getAllFTIRequestsRaw(): Promise<FTIRequest[]> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_REQUEST,
  });
  const rows = res.data.values || [];
  return rows.map((row) => ({
    controlNo: (row[0] || "").toString().trim(),
    userId: (row[1] || "").toString().trim(),
    status: (row[2] || "").toString().trim(),
    dateCreated: (row[3] || "").toString().trim(),
    ftiFileLink: (row[4] || "").toString().trim() || undefined,
    totalAmount: (row[5] || "").toString().trim()
      ? parseFloat((row[5] || "").toString().trim())
      : undefined,
  }));
}

async function getAllDetails(): Promise<FTIDetails[]> {
  const cacheKey = "fti:details";
  const cached = cacheGet<FTIDetails[]>(cacheKey);
  if (cached !== undefined) return cached;

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_DETAILS,
  });
  const rows = res.data.values || [];
  const details = rows.map((row) => ({
    detailId: (row[0] || "").toString().trim(),
    controlNo: (row[1] || "").toString().trim(),
    date: (row[2] || "").toString().trim(),
    itinerary: (row[3] || "").toString().trim(),
    description: (row[4] || "").toString().trim(),
    km: parseFloat((row[5] || "0").toString().trim()) || 0,
    fuelPrice: parseFloat((row[6] || "0").toString().trim()) || 0,
    fuelSubTotal: parseFloat((row[7] || "0").toString().trim()) || 0,
    tollFee: parseFloat((row[8] || "0").toString().trim()) || 0,
  }));
  cacheSet(cacheKey, details, CACHE_TTL_MS);
  return details;
}

async function getAllExpenses(): Promise<FTIExpenses[]> {
  const cacheKey = "fti:expenses";
  const cached = cacheGet<FTIExpenses[]>(cacheKey);
  if (cached !== undefined) return cached;

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_EXPENSES,
  });
  const rows = res.data.values || [];
  const expenses = rows.map((row) => ({
    expenseId: (row[0] || "").toString().trim(),
    detailId: (row[1] || "").toString().trim(),
    miscCode: (row[2] || "").toString().trim(),
    amount: parseFloat((row[3] || "0").toString().trim()) || 0,
  }));
  cacheSet(cacheKey, expenses, CACHE_TTL_MS);
  return expenses;
}

async function getAllLegs(): Promise<FTILegs[]> {
  const cacheKey = "fti:legs";
  const cached = cacheGet<FTILegs[]>(cacheKey);
  if (cached !== undefined) return cached;

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_LEGS,
  });
  const rows = res.data.values || [];
  const legs = rows.map((row) => ({
    legId: (row[0] || "").toString().trim(),
    detailId: (row[1] || "").toString().trim(),
    controlNo: (row[2] || "").toString().trim(),
    originName: (row[3] || "").toString().trim(),
    originAddress: (row[4] || "").toString().trim(),
    destName: (row[5] || "").toString().trim(),
    destAddress: (row[6] || "").toString().trim(),
    tollFee: parseFloat((row[7] || "0").toString().trim()) || 0,
    distanceKm: parseFloat((row[8] || "0").toString().trim()) || 0,
  }));
  cacheSet(cacheKey, legs, CACHE_TTL_MS);
  return legs;
}

// ── FTIRequests ──

export async function getAllFTIRequests(): Promise<FTIRequest[]> {
  const cacheKey = "fti:requests";
  const cached = cacheGet<FTIRequest[]>(cacheKey);
  if (cached !== undefined) return cached;
  const requests = await getAllFTIRequestsRaw();
  cacheSet(cacheKey, requests, CACHE_TTL_MS);
  return requests;
}

export async function getUserFTIRequests(
  userId: string,
): Promise<FTIRequest[]> {
  const all = await getAllFTIRequests();
  return all.filter((request) => request.userId === userId.trim());
}

/**
 * Creates an in-memory FTI request draft. Nothing is written to the
 * spreadsheet until the user saves/submits (see `saveFullFTIRequest`).
 */
export async function createFTIRequest(userId: string): Promise<FTIRequest> {
  return {
    controlNo: generateFTIRef(),
    userId,
    status: "DRAFT",
    dateCreated: formatPhilippineTimestamp(),
  };
}

export async function updateFTIRequestStatus(
  controlNo: string,
  status: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllFTIRequests();
  const idx = all.findIndex((r) => r.controlNo === controlNo);
  if (idx === -1) throw new Error(`FTI request ${controlNo} not found`);
  const rowNumber = idx + 2; // +2: header + 0-index

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!C${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
  invalidateFTICache();
}

/**
 * Write the Google Drive PDF link into column E for an FTI request.
 */
export async function updateFTIFileLink(
  controlNo: string,
  ftiFileLink: string,
): Promise<void> {
  if (!ftiFileLink) return;
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllFTIRequests();
  const idx = all.findIndex((r) => r.controlNo === controlNo);
  if (idx === -1) throw new Error(`FTI request ${controlNo} not found`);
  const rowNumber = idx + 2; // +2: header + 0-index

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[ftiFileLink]] },
  });
  invalidateFTICache();
}

// ── FTIDetails ──

export async function getFTIDetails(controlNo: string): Promise<FTIDetails[]> {
  const all = await getAllDetails();
  return all.filter((d) => d.controlNo === controlNo);
}

export async function saveFTIDetails(
  controlNo: string,
  items: {
    date: string;
    itinerary: string;
    description: string;
    km: number;
    fuelPrice: number;
    tollFee: number;
  }[],
): Promise<FTIDetails[]> {
  await guardEditableStatus(controlNo);

  // Wipe out existing detail rows for this controlNo to avoid orphan row accumulation
  await deleteDetailsAndExpensesForRequest(controlNo);

  if (items.length === 0) return [];

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  // Resolve the request's owner to compute fuel subtotal with their KmPerLiter
  const allRequests = await getAllFTIRequests();
  const req = allRequests.find((r) => r.controlNo === controlNo);
  const kmPerLiter = await getKmPerLiter(req?.userId || "");

  const details: FTIDetails[] = items.map((item) => ({
    detailId: generateUUID(),
    controlNo,
    date: item.date,
    itinerary: item.itinerary,
    description: item.description,
    km: item.km,
    fuelPrice: item.fuelPrice,
    fuelSubTotal: computeFuelSubTotal(item.km, item.fuelPrice, kmPerLiter),
    tollFee: item.tollFee,
  }));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_DETAILS_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: details.map((d) => [
        d.detailId,
        d.controlNo,
        d.date,
        d.itinerary,
        d.description,
        String(d.km),
        String(d.fuelPrice),
        String(d.fuelSubTotal),
        String(d.tollFee),
      ]),
    },
  });

  invalidateFTICache();
  return details;
}

// ── FTILegs ──

/**
 * Fetch legs for a single detail row.
 */
export async function getFTILegs(detailId: string): Promise<FTILegs[]> {
  const all = await getAllLegs();
  return all.filter((leg) => leg.detailId === detailId);
}

async function deleteLegsForRequest(controlNo: string): Promise<void> {
  // Direct read is required to compute exact spreadsheet row numbers.
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_LEGS,
  });
  const rows = res.data.values || [];
  const dirtyRowNumbers: number[] = [];
  rows.forEach((row, i) => {
    if ((row[2] || "").toString().trim() === controlNo) {
      dirtyRowNumbers.push(i + 2);
    }
  });
  await deleteSheetRows(FTI_LEGS_SHEET, dirtyRowNumbers);
  invalidateFTICache();
}

async function saveFTILegs(
  controlNo: string,
  detailId: string,
  legs: FTILegsInput[],
): Promise<void> {
  if (!legs || legs.length === 0) return;
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const rows = legs.map((leg) => [
    leg.legId || generateUUID(),
    detailId,
    controlNo,
    (leg.originName || "").toString().trim().toUpperCase(),
    (leg.originAddress || "").toString().trim().toUpperCase(),
    (leg.destName || "").toString().trim().toUpperCase(),
    (leg.destAddress || "").toString().trim().toUpperCase(),
    String(leg.tollFee || 0),
    String(leg.distanceKm || 0),
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_LEGS_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
  invalidateFTICache();
}

// ── FTIExpenses ──

export async function getFTIExpenses(detailId: string): Promise<FTIExpenses[]> {
  const all = await getAllExpenses();
  return all.filter((exp) => exp.detailId === detailId);
}

export async function saveFTIExpenses(
  detailId: string,
  items: { miscCode: string; amount: number }[],
): Promise<FTIExpenses[]> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const allDetails = await getAllDetails();
  const detail = allDetails.find((d) => d.detailId === detailId);
  if (detail) {
    await guardEditableStatus(detail.controlNo);
  }

  const expenses: FTIExpenses[] = items.map((item) => ({
    expenseId: generateUUID(),
    detailId,
    miscCode: item.miscCode,
    amount: item.amount,
  }));

  if (expenses.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FTI_EXPENSES_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: expenses.map((e) => [
          e.expenseId,
          e.detailId,
          e.miscCode,
          String(e.amount),
        ]),
      },
    });
  }

  invalidateFTICache();
  return expenses;
}

async function deleteDetailsAndExpensesForRequest(
  controlNo: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  // Direct reads: we need exact spreadsheet row numbers for deletion.
  const [detailsRes, expensesRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE_DETAILS }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE_EXPENSES }),
  ]);

  const detailRows = detailsRes.data.values || [];
  const expenseRows = expensesRes.data.values || [];

  const detailIds = new Set<string>();
  const detailRowNumbers: number[] = [];
  detailRows.forEach((row, i) => {
    if ((row[1] || "").toString().trim() === controlNo) {
      detailIds.add((row[0] || "").toString().trim());
      detailRowNumbers.push(i + 2);
    }
  });

  const expenseRowNumbers: number[] = [];
  expenseRows.forEach((row, i) => {
    const detailId = (row[1] || "").toString().trim();
    if (detailIds.has(detailId)) {
      expenseRowNumbers.push(i + 2);
    }
  });

  await deleteSheetRows(FTI_EXPENSES_SHEET, expenseRowNumbers);
  await deleteSheetRows(FTI_DETAILS_SHEET, detailRowNumbers);
  await deleteLegsForRequest(controlNo);
  invalidateFTICache();
}

export async function getFTIRequestFull(
  controlNo: string,
): Promise<FTIRequestFull | null> {
  const [all, users] = await Promise.all([
    getAllFTIRequests(),
    getUsers().catch(() => []),
  ]);
  const req = all.find((r) => r.controlNo === controlNo);
  if (!req) return null;

  const user = users.find((u) => u.userId === req.userId);

  // Bulk-read all three sheets once (cached) and join in memory.
  const [details, expenses, legs] = await Promise.all([
    getAllDetails(),
    getAllExpenses(),
    getAllLegs(),
  ]);

  const detailsForRequest = details.filter((d) => d.controlNo === controlNo);
  const detailsWithExpenses = detailsForRequest.map((det) => {
    const detExpenses = expenses.filter((e) => e.detailId === det.detailId);
    const detLegs = legs.filter((l) => l.detailId === det.detailId);
    return { ...det, expenses: detExpenses, legs: detLegs };
  });

  const computedTotal = detailsWithExpenses.reduce(
    (sum, det) => sum + computeDetailTotal(det, det.expenses),
    0,
  );
  const totalAmount =
    typeof req.totalAmount === "number" ? req.totalAmount : computedTotal;

  return {
    ...req,
    userName: user?.fullName || req.userId,
    totalAmount,
    details: detailsWithExpenses,
  };
}

export async function deleteFTIRequest(controlNo: string): Promise<void> {
  await guardEditableStatus(controlNo);
  await deleteDetailsAndExpensesForRequest(controlNo);
  const rowNumber = await findRequestRowNumber(controlNo);
  await deleteSheetRows(FTI_REQUEST_SHEET, [rowNumber]);
  invalidateFTICache();
}

export async function saveFullFTIRequest(
  controlNo: string,
  status: string,
  details: FTIDetailInput[],
  userId?: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const all = await getAllFTIRequests();
  const existing = all.find((r) => r.controlNo === controlNo);

  // Resolve the owner of this request to compute fuel subtotals correctly.
  const effectiveUserId = existing?.userId || userId || "";
  const kmPerLiter = await getKmPerLiter(effectiveUserId);

  if (existing) {
    const currentStatus = existing.status.toUpperCase();
    if (status.toUpperCase() === "SUBMITTED") {
      if (!["SAVED", "DRAFT", "REJECTED"].includes(currentStatus)) {
        throw new Error(
          `Cannot submit request ${controlNo}: status is "${existing.status}".`,
        );
      }
    } else {
      await guardEditableStatus(controlNo);
    }
    await updateFTIRequestStatus(controlNo, status);
  } else {
    // First save: create the request row (memory-stage draft becomes persisted)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FTI_REQUEST_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [controlNo, effectiveUserId, status, formatPhilippineTimestamp()],
        ],
      },
    });
    invalidateFTICache();
  }

  await deleteDetailsAndExpensesForRequest(controlNo);

  if (details.length === 0) return;

  const savedDetails: FTIDetails[] = details.map((item) => ({
    detailId: item.detailId || generateUUID(),
    controlNo,
    date: item.date,
    itinerary: item.itinerary.toUpperCase(),
    description: (item.description || "").toUpperCase(),
    km: item.km,
    fuelPrice: item.fuelPrice,
    fuelSubTotal:
      item.fuelSubTotal !== undefined
        ? parseFloat(item.fuelSubTotal.toFixed(2))
        : computeFuelSubTotal(item.km, item.fuelPrice, kmPerLiter),
    tollFee: item.tollFee,
  }));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_DETAILS_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: savedDetails.map((d) => [
        d.detailId,
        d.controlNo,
        d.date,
        d.itinerary,
        d.description,
        String(d.km),
        String(d.fuelPrice),
        String(d.fuelSubTotal),
        String(d.tollFee),
      ]),
    },
  });
  invalidateFTICache();

  // Save per-leg origin/dest, toll, distance
  for (let i = 0; i < details.length; i++) {
    const item = details[i];
    const detailId = savedDetails[i].detailId;
    if (item.legs && item.legs.length > 0) {
      await saveFTILegs(controlNo, detailId, item.legs);
    }
  }

  const allExpenses: FTIExpenses[] = [];
  for (let i = 0; i < details.length; i++) {
    const item = details[i];
    const detailId = savedDetails[i].detailId;
    for (const exp of item.expenses || []) {
      if (!exp.miscCode) continue;
      allExpenses.push({
        expenseId: generateUUID(),
        detailId,
        miscCode: exp.miscCode,
        amount: exp.amount,
      });
    }
  }

  if (allExpenses.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FTI_EXPENSES_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: allExpenses.map((e) => [
          e.expenseId,
          e.detailId,
          e.miscCode,
          String(e.amount),
        ]),
      },
    });
      // Persist the total to column F so list views do not recompute per row.
  const totalAmount = savedDetails.reduce((sum, det) => {
    const detExp = allExpenses.filter((e) => e.detailId === det.detailId);
    return sum + computeDetailTotal(det, detExp);
  }, 0);
  const updatedAll = await getAllFTIRequests();
  const rowIdx = updatedAll.findIndex((r) => r.controlNo === controlNo);
  if (rowIdx !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "!F",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(totalAmount)]] },
    });
    invalidateFTICache();
  }
  invalidateFTICache();
  }
}

// ── Info / Lookup Data ──

export async function getTechnicians(): Promise<
  { userId: string; fullName: string }[]
> {
  const users = await getUsers();
  return users
    .filter((u) => u.departmentId === 1 && u.positionId === 2)
    .map((u) => ({ userId: u.userId, fullName: u.fullName }));
}

export async function getMiscellaneous(): Promise<
  { code: string; description: string }[]
> {
  return await getAllMiscellaneous();
}

export async function getCustomersList(): Promise<
  { customerName: string; address: string }[]
> {
  const customers = await getCustomers();
  return customers.map((c) => ({
    customerName: c.customerName,
    address: c.address,
  }));
}

// ── Toll Matrix ──

export async function getExpresswayGroups(): Promise<
  { name: string; gates: string[] }[]
> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TOLL_MATRIX_SHEET}!A:A`,
  });
  const rows = res.data.values || [];

  return EXPRESSWAY_GROUPS.map(({ name, startRow, endRow }) => {
    const gates: string[] = [];
    for (let i = startRow - 1; i < Math.min(endRow, rows.length); i++) {
      const gate = (rows[i]?.[0] || "").toString().trim();
      if (gate) gates.push(gate);
    }
    return { name, gates };
  }).filter((g) => g.gates.length > 0);
}

export async function getTollMatrix(): Promise<{
  gates: string[];
  matrix: number[][];
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: TOLL_MATRIX_SHEET,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) {
    return { gates: [], matrix: [] };
  }

  const gates = rows[0]
    .slice(1)
    .map((g) => g.toString().trim())
    .filter(Boolean);
  const gatesLower = gates.map((g) => g.toLowerCase());

  const matrix: number[][] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const gateName = (row[0] || "").toString().trim();
    const gateIndex = gatesLower.indexOf(gateName.toLowerCase());
    if (gateIndex === -1) continue;

    const rowValues: number[] = [];
    for (let j = 0; j < gates.length; j++) {
      const cellVal = row[j + 1];
      const num = parseFloat(cellVal?.toString().trim() || "0");
      rowValues.push(isNaN(num) ? 0 : num);
    }
    matrix[gateIndex] = rowValues;
  }

  return { gates, matrix };
}

// ── Bulk High-Performance Fetcher ──

export async function getAllFTIEntries(): Promise<
  {
    technician: string;
    date: string;
    itinerary: string;
    description: string;
    kilometer: number;
    fuelPrice: number;
    fuelSubTotal: number;
    tollFee: number;
    miscellaneous: string;
    miscAmount: number;
    ftiRef: string;
    status: string;
  }[]
> {
  const [requests, details, expenses, users] = await Promise.all([
    getAllFTIRequests(),
    getAllDetails(),
    getAllExpenses(),
    getUsers().catch(() => []),
  ]);

  const userMap = new Map(users.map((u) => [u.userId, u.fullName]));

  const expenseMap = new Map<string, { codes: string[]; total: number }>();
  for (const exp of expenses) {
    const detailId = exp.detailId;
    if (!expenseMap.has(detailId)) {
      expenseMap.set(detailId, { codes: [], total: 0 });
    }
    const entry = expenseMap.get(detailId)!;
    if (exp.miscCode) entry.codes.push(exp.miscCode);
    entry.total += exp.amount;
  }

  const detailsMap = new Map<string, any[]>();
  for (const det of details) {
    const expData = expenseMap.get(det.detailId) || { codes: [], total: 0 };
    if (!detailsMap.has(det.controlNo)) {
      detailsMap.set(det.controlNo, []);
    }
    detailsMap.get(det.controlNo)!.push({
      ...det,
      miscCodes: expData.codes,
      miscAmount: expData.total,
    });
  }

  const entries: any[] = [];
  for (const req of requests) {
    const technician = userMap.get(req.userId) || req.userId;
    const reqDetails = detailsMap.get(req.controlNo) || [];
    for (const det of reqDetails) {
      entries.push({
        technician,
        date: det.date,
        itinerary: det.itinerary,
        description: det.description,
        kilometer: det.km,
        fuelPrice: det.fuelPrice,
        fuelSubTotal: det.fuelSubTotal,
        tollFee: det.tollFee,
        miscellaneous: det.miscCodes.join(", "),
        miscAmount: det.miscAmount,
        ftiRef: req.controlNo,
        status: req.status,
      });
    }
  }

  return entries;
}

// ── Backward-compatible legacy handlers ──

export async function submitFTIEntry(data: {
  technician: string;
  date: string;
  itinerary: string;
  description: string;
  kilometer: string;
  fuelPrice: string;
  tollFee: string;
  miscellaneous: string;
  miscAmount: string;
  ftiRef: string;
  status?: string;
}): Promise<void> {
  await submitFTIEntries([data]);
}

export async function submitFTIEntries(
  rows: {
    technician: string;
    date: string;
    itinerary: string;
    description: string;
    kilometer: string;
    fuelPrice: string;
    tollFee: string;
    miscellaneous: string;
    miscAmount: string;
    ftiRef: string;
    status?: string;
  }[],
): Promise<void> {
  if (rows.length === 0) return;

  const controlNo = rows[0].ftiRef || generateFTIRef();
  const users = await getUsers().catch(() => []);
  const technicianName = rows[0].technician;
  const user = users.find(
    (u) => u.fullName.toLowerCase() === technicianName.toLowerCase(),
  );

  const userId = user?.userId || technicianName;

  const allRequests = await getAllFTIRequests();
  const existingReq = allRequests.find((r) => r.controlNo === controlNo);

  if (!existingReq) {
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FTI_REQUEST_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            controlNo,
            userId,
            rows[0].status || "SAVED",
            formatPhilippineTimestamp(),
          ],
        ],
      },
    });
    invalidateFTICache();
  }

  const formattedDetails: FTIDetailInput[] = rows.map((row) => {
    const miscCodes = row.miscellaneous
      ? row.miscellaneous
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean)
      : [];
    const totalMisc = parseFloat(row.miscAmount) || 0;
    const perMiscAmount =
      miscCodes.length > 0 ? totalMisc / miscCodes.length : 0;

    return {
      date: row.date,
      itinerary: row.itinerary,
      description: row.description,
      km: parseFloat(row.kilometer) || 0,
      fuelPrice: parseFloat(row.fuelPrice) || 0,
      tollFee: parseFloat(row.tollFee) || 0,
      expenses: miscCodes.map((code) => ({
        miscCode: code,
        amount: perMiscAmount,
      })),
    };
  });

  await saveFullFTIRequest(
    controlNo,
    rows[0].status || "SAVED",
    formattedDetails,
  );
}

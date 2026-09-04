import crypto from "crypto";
import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getFTISpreadsheetId,
} from "@/lib/googleSheets";
import { getAllMiscellaneous } from "@/lib/miscellaneousSheets";
import { getUsers } from "@/lib/userSheets";
import { getCompanies } from "@/lib/companySheets";
import { EXPRESSWAY_GROUPS } from "@/lib/tollMatrix";
import type {
  FTIRequest,
  FTIDetails,
  FTIExpenses,
  FTILegs,
  FTISegments,
  FTIDetailInput,
  FTILegsInput,
  FTIRequestFull,
} from "@/types/fti";
import {
  computeDetailTotal,
  computeFuelCost,
  isEditableStatus,
} from "@/types/fti";

// ── Constants ──
const FTI_REQUEST_SHEET = "FTIRequests";
const FTI_DETAILS_SHEET = "FTIDetails";
const FTI_EXPENSES_SHEET = "FTIExpenses";
const FTI_LEGS_SHEET = "FTILegs";
const FTI_SEGMENTS_SHEET = "FTISegments";
const USER_FUEL_PER_KM_SHEET = "UserFuelPerKm";
const FTI_LIST_SHEET = "FTIList";

const RANGE_REQUEST = `${FTI_REQUEST_SHEET}!A2:K`;
const RANGE_DETAILS = `${FTI_DETAILS_SHEET}!A2:I`; // A=detailId, B=controlNo, C=date, D=itinerary, E=description, F=km, G=fuelPrice, H=fuelSubTotal, I=tollFee
const RANGE_EXPENSES = `${FTI_EXPENSES_SHEET}!A2:D`; // A=expenseId, B=detailId, C=miscCode, D=amount
const RANGE_LEGS = `${FTI_LEGS_SHEET}!A2:I`; // A=legId, B=detailId, C=controlNo, D=originName, E=originAddress, F=destName, G=destAddress, H=tollFee, I=distanceKm
const RANGE_SEGMENTS = `${FTI_SEGMENTS_SHEET}!A2:H`; // A=segmentId, B=legId, C=detailId, D=controlNo, E=group, F=entryGate, G=exitGate, H=tollFee
const RANGE_USER_FUEL = `${USER_FUEL_PER_KM_SHEET}!A2:B`; // A=userId, B=KmPerLiter

const TOLL_MATRIX_SHEET = "Toll Matrix Table";

const DEFAULT_KM_PER_LITER = 12;

// UserId → legacy FTIList technician name (matches the previous tech admin's records).
const FTI_LIST_TECHNICIAN_NAMES: Record<string, string> = {
  "24b3d020-de29-4ad6-9045-cd38bbf9fa92": "Edralinda, Jhon Jhon C.",
  "02b3e166-2cfe-4620-9c2f-b1e592b49b1e": "Abogado, Jerico",
  "743f7a59-7a74-447d-9495-1ba93dfdc7f7": "Sacop, Jodillo",
  "54c8e375-fa9f-4d1c-b214-2a325bd2fd07": "Ordonez, Atillano",
  "cc476062-ec0f-4861-9fe8-da2a6dfd6c9c": "Carmona Von",
};

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
  if (!isEditableStatus(req.status)) {
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
    approvedByUserId: (row[6] || "").toString().trim() || undefined,
    approvedByName: (row[7] || "").toString().trim() || undefined,
    approvedBySignatureUrl: (row[8] || "").toString().trim() || undefined,
    approvedDate: (row[9] || "").toString().trim() || undefined,
    approvalComment: (row[10] || "").toString().trim() || undefined,
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

async function getAllSegments(): Promise<FTISegments[]> {
  const cacheKey = "fti:segments";
  const cached = cacheGet<FTISegments[]>(cacheKey);
  if (cached !== undefined) return cached;

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SEGMENTS,
  });
  const rows = res.data.values || [];
  const segments = rows.map((row) => ({
    segmentId: (row[0] || "").toString().trim(),
    legId: (row[1] || "").toString().trim(),
    detailId: (row[2] || "").toString().trim(),
    controlNo: (row[3] || "").toString().trim(),
    groupName: (row[4] || "").toString().trim(),
    entryGate: (row[5] || "").toString().trim(),
    exitGate: (row[6] || "").toString().trim(),
    tollFee: parseFloat((row[7] || "0").toString().trim()) || 0,
  }));
  cacheSet(cacheKey, segments, CACHE_TTL_MS);
  return segments;
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

/**
 * Resolve the approver for a requester from the UserApprovers sheet.
 * Returns undefined when no approver is configured.
 */
export async function resolveApproverForRequester(
  userId: string,
): Promise<{ approverUserId: string } | null> {
  try {
    const { getApproverForRequester } =
      await import("@/lib/userApproverSheets");
    const { getUsers } = await import("@/lib/userSheets");
    const users = await getUsers().catch(() => []);
    const user = users.find((u) => u.userId === userId);
    if (!user) return null;
    const mapping = await getApproverForRequester(
      userId,
      user.departmentId,
      "FTI",
    );
    return mapping ? { approverUserId: mapping.approverUserId } : null;
  } catch {
    return null;
  }
}

export async function updateFTIApproval(
  controlNo: string,
  action: "approve" | "request_change" | "reject",
  approvedByUserId: string,
  approvedByName?: string,
  approvedBySignatureUrl?: string,
  comment?: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllFTIRequests();
  const idx = all.findIndex((r) => r.controlNo === controlNo);
  if (idx === -1) throw new Error(`FTI request ${controlNo} not found`);
  const rowNumber = idx + 2; // +2: header + 0-index

  const status =
    action === "approve"
      ? "APPROVED"
      : action === "request_change"
        ? "REQUESTED_FOR_CHANGE"
        : "REJECTED";
  const dateApproved = formatPhilippineTimestamp();
  const isApprove = action === "approve";

  const sheets = await getSheetsClient();
  // Write each column independently so DateCreated (D), ftiFileLink (E),
  // and totalAmount (F) are never touched or erased.
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!C${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!G${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[approvedByUserId]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!H${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? approvedByName : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!I${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? approvedBySignatureUrl : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!J${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? dateApproved : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!K${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[comment || ""]] },
  });

  // Mirror the approved details into the legacy FTIList tab (approve only).
  if (action === "approve") {
    await exportFTIListOnApproval(controlNo).catch(() => {
      // Non-fatal: approval already persisted; log export failure.
    });
  }
  invalidateFTICache();
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

  // When a request is submitted, auto-assign the configured approver.
  if (status.toUpperCase() === "SENT") {
    const req = all[idx];
    if (req && !req.approvedByUserId) {
      // Approval exemption: users flagged "does not require approval" have
      // their FTI auto-approved on submission, without an approver.
      const { getUsers } = await import("@/lib/userSheets");
      const users = await getUsers().catch(() => []);
      const requester = users.find((u) => u.userId === req.userId);

      if (requester && requester.requiresApproval === false) {
        const sheets = await getSheetsClient();
        const dateApproved = formatPhilippineTimestamp();
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${FTI_REQUEST_SHEET}!C${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["APPROVED"]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${FTI_REQUEST_SHEET}!G${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[req.userId]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${FTI_REQUEST_SHEET}!H${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[requester.fullName]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${FTI_REQUEST_SHEET}!J${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[dateApproved]] },
        });
        // Mirror the approved details into the legacy FTIList tab (non-fatal).
        await exportFTIListOnApproval(controlNo).catch(() => {});
        invalidateFTICache();
        return;
      }

      const approver = await resolveApproverForRequester(req.userId);
      if (!approver) {
        throw new Error(
          "No approver is configured for this user. Contact your administrator before submitting.",
        );
      }
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${FTI_REQUEST_SHEET}!C${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[status]] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${FTI_REQUEST_SHEET}!G${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[approver.approverUserId]] },
      });
      invalidateFTICache();
      return;
    }
  }

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

/**
 * Append the approved request's details to the legacy FTIList tab.
 * FTIList columns: A=Technician, B=Date, C=Itinerary, D=Description,
 * E=Kilometer, F=Fuel Price, G=Toll gate, H=Miscellaneous, I=Misc. Amount, J=FTI REF
 * One row per detail; misc codes joined by ", " and amounts summed.
 */
export async function exportFTIListOnApproval(
  controlNo: string,
): Promise<void> {
  const full = await getFTIRequestFull(controlNo);
  if (!full) return;

  const technician =
    FTI_LIST_TECHNICIAN_NAMES[full.userId] || full.userName || full.userId;

  const miscMap = new Map<string, string>();
  for (const m of await getAllMiscellaneous()) {
    miscMap.set(m.code, m.description || m.code);
  }

  const rows = full.details.map((det) => {
    const codes = det.expenses.map((e) => e.miscCode).filter(Boolean);
    const miscDesc = codes.map((c) => miscMap.get(c) || c).join(", ");
    const miscAmount = det.expenses.reduce((s, e) => s + (e.amount || 0), 0);
    // FTIList dates are DD/MM/YYYY; our detail dates are YYYY-MM-DD.
    const dateParts = (det.date || "").split("-");
    const legacyDate =
      dateParts.length === 3
        ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
        : det.date;

    return [
      technician,
      legacyDate,
      det.itinerary,
      det.description,
      String(det.km || 0),
      String(det.fuelPrice || 0),
      String(det.tollFee || 0),
      miscDesc,
      miscAmount ? String(miscAmount) : "",
      controlNo,
    ];
  });

  if (rows.length === 0) return;

  const spreadsheetId = await getFTISpreadsheetId();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_LIST_SHEET}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
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
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const legsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_LEGS,
  });
  const legRows = legsRes.data.values || [];
  const legIds = new Set<string>();
  const legRowNumbers: number[] = [];
  legRows.forEach((row, i) => {
    if ((row[2] || "").toString().trim() === controlNo) {
      legIds.add((row[0] || "").toString().trim());
      legRowNumbers.push(i + 2);
    }
  });

  if (legIds.size > 0) {
    const segRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_SEGMENTS,
    });
    const segRows = segRes.data.values || [];
    const segRowNumbers: number[] = [];
    segRows.forEach((row, i) => {
      if (legIds.has((row[1] || "").toString().trim())) {
        segRowNumbers.push(i + 2);
      }
    });
    await deleteSheetRows(FTI_SEGMENTS_SHEET, segRowNumbers);
  }

  await deleteSheetRows(FTI_LEGS_SHEET, legRowNumbers);
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

  const legRows = legs.map((leg) => {
    const segmentTotal = (leg.segments || []).reduce(
      (s, seg) => s + (seg.tollFee || 0),
      0,
    );
    const tollFee = segmentTotal > 0 ? segmentTotal : leg.tollFee || 0;
    return {
      legId: leg.legId || generateUUID(),
      parked: [
        detailId,
        controlNo,
        (leg.originName || "").toString().trim().toUpperCase(),
        (leg.originAddress || "").toString().trim().toUpperCase(),
        (leg.destName || "").toString().trim().toUpperCase(),
        (leg.destAddress || "").toString().trim().toUpperCase(),
        String(tollFee),
        String(leg.distanceKm || 0),
      ],
    };
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_LEGS_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: legRows.map((l) => [l.legId, ...l.parked]),
    },
  });

  // One row per expressway segment, linked to its leg via LegId.
  const segmentRows: (string | number)[][] = [];
  legRows.forEach((l, i) => {
    for (const seg of legs[i].segments || []) {
      if (!seg.group) continue;
      segmentRows.push([
        generateUUID(),
        l.legId,
        detailId,
        controlNo,
        seg.group,
        seg.entry,
        seg.exit,
        seg.tollFee || 0,
      ]);
    }
  });
  if (segmentRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FTI_SEGMENTS_SHEET}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: segmentRows },
    });
  }

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

// ── Single-detail immediate persistence (DRAFT row-save flow) ──

async function deleteSingleDetailRow(detailId: string): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const [expensesRes, legsRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE_EXPENSES }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE_LEGS }),
  ]);

  const expenseRowNumbers: number[] = [];
  (expensesRes.data.values || []).forEach((row, i) => {
    if ((row[1] || "").toString().trim() === detailId) {
      expenseRowNumbers.push(i + 2);
    }
  });

  const legIds = new Set<string>();
  const legRowNumbers: number[] = [];
  (legsRes.data.values || []).forEach((row, i) => {
    if ((row[1] || "").toString().trim() === detailId) {
      legIds.add((row[0] || "").toString().trim());
      legRowNumbers.push(i + 2);
    }
  });

  if (legIds.size > 0) {
    const segRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_SEGMENTS,
    });
    const segRowNumbers: number[] = [];
    (segRes.data.values || []).forEach((row, i) => {
      if (legIds.has((row[1] || "").toString().trim())) {
        segRowNumbers.push(i + 2);
      }
    });
    await deleteSheetRows(FTI_SEGMENTS_SHEET, segRowNumbers);
  }

  await deleteSheetRows(FTI_EXPENSES_SHEET, expenseRowNumbers);
  await deleteSheetRows(FTI_LEGS_SHEET, legRowNumbers);

  const detailsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_DETAILS,
  });
  const detailRowNumbers: number[] = [];
  (detailsRes.data.values || []).forEach((row, i) => {
    if ((row[0] || "").toString().trim() === detailId) {
      detailRowNumbers.push(i + 2);
    }
  });
  await deleteSheetRows(FTI_DETAILS_SHEET, detailRowNumbers);
  invalidateFTICache();
}

async function saveDetailExpenses(
  detailId: string,
  expenses: { miscCode: string; amount: number }[],
): Promise<void> {
  if (!expenses || expenses.length === 0) return;
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_EXPENSES_SHEET}!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: expenses
        .filter((e) => e.miscCode)
        .map((e) => [
          generateUUID(),
          detailId,
          e.miscCode,
          String(e.amount || 0),
        ]),
    },
  });
  invalidateFTICache();
}

async function recomputeRequestTotal(controlNo: string): Promise<void> {
  const [details, expenses, all] = await Promise.all([
    getAllDetails(),
    getAllExpenses(),
    getAllFTIRequests(),
  ]);
  const idx = all.findIndex((r) => r.controlNo === controlNo);
  if (idx === -1) return;
  const dets = details.filter((d) => d.controlNo === controlNo);
  const total = dets.reduce((sum, det) => {
    const detExp = expenses.filter((e) => e.detailId === det.detailId);
    return sum + computeDetailTotal(det, detExp);
  }, 0);
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FTI_REQUEST_SHEET}!F${idx + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[String(total)]] },
  });
  invalidateFTICache();
}

/**
 * Immediately persist a single itinerary (detail) row under a DRAFT request.
 * Auto-creates the request row on first add when no controlNo exists yet.
 */
export async function appendFTIDetail(
  controlNo: string,
  detail: FTIDetailInput,
  userId?: string,
): Promise<{ controlNo: string; detailId: string }> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const all = await getAllFTIRequests();
  let existing = all.find((r) => r.controlNo === controlNo);

  if (!existing) {
    const effectiveUserId = userId || "";
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FTI_REQUEST_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[controlNo, effectiveUserId, "DRAFT", formatPhilippineTimestamp()]],
      },
    });
    invalidateFTICache();
    existing = {
      controlNo,
      userId: effectiveUserId,
      status: "DRAFT",
      dateCreated: formatPhilippineTimestamp(),
    };
  }

  await guardEditableStatus(controlNo);

  const effectiveUserIdForFuel = existing?.userId || userId || "";
  const kmPerLiter = await getKmPerLiter(effectiveUserIdForFuel);
  const detailId = detail.detailId || generateUUID();
  const fuelSubTotal =
    detail.fuelSubTotal !== undefined
      ? parseFloat(detail.fuelSubTotal.toFixed(2))
      : computeFuelSubTotal(detail.km, detail.fuelPrice, kmPerLiter);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${FTI_DETAILS_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          detailId,
          controlNo,
          detail.date,
          (detail.itinerary || "").toUpperCase(),
          (detail.description || "").toUpperCase(),
          String(detail.km || 0),
          String(detail.fuelPrice || 0),
          String(fuelSubTotal),
          String(detail.tollFee || 0),
        ],
      ],
    },
  });

  if (detail.legs && detail.legs.length > 0) {
    await saveFTILegs(controlNo, detailId, detail.legs);
  }
  await saveDetailExpenses(detailId, detail.expenses || []);
  await recomputeRequestTotal(controlNo);
  invalidateFTICache();
  return { controlNo, detailId };
}

/** Replace a single detail row (used when editing an itinerary row). */
export async function updateFTIDetail(
  controlNo: string,
  detailId: string,
  detail: FTIDetailInput,
  userId?: string,
): Promise<void> {
  await guardEditableStatus(controlNo);
  await deleteSingleDetailRow(detailId);
  await appendFTIDetail(controlNo, { ...detail, detailId }, userId);
}

/** Delete a single detail row plus its expenses/legs/segments. */
export async function deleteFTIDetailRow(detailId: string): Promise<void> {
  const allDetails = await getAllDetails();
  const det = allDetails.find((d) => d.detailId === detailId);
  if (!det) return;
  await guardEditableStatus(det.controlNo);
  await deleteSingleDetailRow(detailId);
  await recomputeRequestTotal(det.controlNo);
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
  const [details, expenses, legs, segments] = await Promise.all([
    getAllDetails(),
    getAllExpenses(),
    getAllLegs(),
    getAllSegments(),
  ]);

  const detailsForRequest = details.filter((d) => d.controlNo === controlNo);
  const detailsWithExpenses = detailsForRequest.map((det) => {
    const detExpenses = expenses.filter((e) => e.detailId === det.detailId);
    const detLegs = legs
      .filter((l) => l.detailId === det.detailId)
      .map((l) => ({
        ...l,
        segments: segments.filter((s) => s.legId === l.legId),
      }));
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
      if (!["DRAFT", "REQUESTED_FOR_CHANGE"].includes(currentStatus)) {
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
  }

  // Persist the total to column F so list views do not recompute per row.
  const totalAmount = savedDetails.reduce((sum, det) => {
    const detExp = allExpenses.filter((e) => e.detailId === det.detailId);
    return sum + computeDetailTotal(det, detExp);
  }, 0);
  const updatedAll = await getAllFTIRequests();
  const rowIdx = updatedAll.findIndex((r) => r.controlNo === controlNo);
  if (rowIdx !== -1) {
    const rowNumber = rowIdx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: FTI_REQUEST_SHEET + "!F" + rowNumber,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(totalAmount)]] },
    });
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

export async function getCompanyList(): Promise<
  { companyName: string; address: string }[]
> {
  const companies = await getCompanies();
  return companies.map((c) => ({
    companyName: c.companyName,
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

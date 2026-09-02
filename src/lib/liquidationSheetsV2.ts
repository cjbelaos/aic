/**
 * Expense Liquidation V2 — ISOLATED SANDBOX Google Sheets library.
 *
 * Duplicates the production `liquidationSheets.ts` logic but targets the
 * dedicated `Liquidations_V2` / `ReceiptItems_V2` tabs so the production
 * `Liquidations` / `ReceiptItems` tabs are NEVER touched. The tabs are
 * auto-provisioned on first use (created + headers written if missing).
 *
 * This file is intentionally standalone: it only imports `googleSheets.ts`
 * helpers and the V2 types — production liquidation code is not shared.
 */
import crypto from "crypto";
import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
} from "@/lib/googleSheets";
import {
  LIQUIDATIONS_V2_HEADERS,
  RECEIPT_ITEMS_V2_HEADERS,
} from "@/types/liquidation-v2";
import type {
  ReceiptItemV2,
  ReceiptItemV2Input,
  LiquidationFullV2,
} from "@/types/liquidation-v2";
import type { Liquidation } from "@/types/liquidation";

// ── Constants ──
const LIQUIDATIONS_SHEET = "Liquidations_V2";
const RECEIPT_ITEMS_SHEET = "ReceiptItems_V2";
const RANGE_LIQUIDATIONS = `${LIQUIDATIONS_SHEET}!A2:K`;
const RANGE_RECEIPT_ITEMS = `${RECEIPT_ITEMS_SHEET}!A2:AB`;
// Column index (0-based) → field mapping for ReceiptItems_V2.
const COL = {
  receiptItemId: 0,
  liquidationId: 1,
  date: 2,
  description: 3,
  miscellaneousCode: 4,
  amount: 5,
  receiptImageUrl: 6,
  siNumber: 7,
  siDate: 8,
  drNumber: 9,
  drDate: 10,
  crNumber: 11,
  crDate: 12,
  bsNumber: 13,
  bsDate: 14,
  orNumber: 15,
  orDate: 16,
  othersDate: 17,
  refNo: 18,
  tin: 19,
  supplierName: 20,
  address: 21,
  checkNo: 22,
  cvNo: 23,
  particulars: 24,
  grossAmount: 25,
  vat: 26,
  ewt: 27,
} as const;

// ── Simple TTL Cache (matches production pattern) ──
const cache = new Map<string, { value: unknown; expires: number }>();
const CACHE_TTL_MS = 10_000;

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size > 500) {
    for (const [k] of cache) cache.delete(k);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function invalidateV2Cache(): void {
  for (const [key] of cache) {
    if (key.startsWith("liqv2:")) cache.delete(key);
  }
}
// ── Auto-provisioning ──
/**
 * Ensures the `Liquidations_V2` and `ReceiptItems_V2` tabs exist in the
 * database spreadsheet, creating them (with header rows) when missing.
 * Production tabs are never touched. Safe to call on every API request.
 */
export async function ensureLiquidationV2Sheets(): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = spreadsheet.data.sheets || [];
  const titles = new Set(
    existing
      .map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === "string"),
  );

  const requests: {
    addSheet?: {
      properties: {
        title: string;
        gridProperties?: { rowCount: number; columnCount: number };
      };
    };
  }[] = [];
  const headersToWrite: { range: string; values: string[][] }[] = [];

  if (!titles.has(LIQUIDATIONS_SHEET)) {
    requests.push({
      addSheet: {
        properties: {
          title: LIQUIDATIONS_SHEET,
          gridProperties: { rowCount: 200, columnCount: 11 },
        },
      },
    });
    headersToWrite.push({
      range: `${LIQUIDATIONS_SHEET}!A1:K1`,
      values: [LIQUIDATIONS_V2_HEADERS as unknown as string[]],
    });
  }

  if (!titles.has(RECEIPT_ITEMS_SHEET)) {
    requests.push({
      addSheet: {
        properties: {
          title: RECEIPT_ITEMS_SHEET,
          gridProperties: { rowCount: 200, columnCount: 28 },
        },
      },
    });
    headersToWrite.push({
      range: `${RECEIPT_ITEMS_SHEET}!A1:AB1`,
      values: [RECEIPT_ITEMS_V2_HEADERS as unknown as string[]],
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  for (const h of headersToWrite) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: h.range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: h.values },
    });
  }
}

// ── Helpers ──
function generateUUID(): string {
  return crypto.randomUUID();
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
  invalidateV2Cache();
}
/** Maps a ReceiptItems_V2 row array to a typed object. */
function rowToReceiptItemV2(row: (string | number)[]): ReceiptItemV2 {
  const str = (i: number) => (row[i] ?? "").toString().trim();
  const num = (i: number) => parseFloat(str(i)) || 0;
  return {
    receiptItemId: str(COL.receiptItemId),
    liquidationId: str(COL.liquidationId),
    date: str(COL.date),
    description: str(COL.description),
    // V2 schema uses MiscellaneousCode; mirror it into `category` so shared
    // renderers (pivot/print) that expect `ReceiptItem.category` keep working.
    category: str(COL.miscellaneousCode),
    miscellaneousCode: str(COL.miscellaneousCode),
    amount: num(COL.amount),
    receiptImageUrl: str(COL.receiptImageUrl),
    siNumber: str(COL.siNumber),
    siDate: str(COL.siDate),
    drNumber: str(COL.drNumber),
    drDate: str(COL.drDate),
    crNumber: str(COL.crNumber),
    crDate: str(COL.crDate),
    bsNumber: str(COL.bsNumber),
    bsDate: str(COL.bsDate),
    orNumber: str(COL.orNumber),
    orDate: str(COL.orDate),
    othersDate: str(COL.othersDate),
    refNo: str(COL.refNo),
    tin: str(COL.tin),
    supplierName: str(COL.supplierName),
    address: str(COL.address),
    checkNo: str(COL.checkNo),
    cvNo: str(COL.cvNo),
    particulars: str(COL.particulars),
    grossAmount: num(COL.grossAmount),
    vat: num(COL.vat),
    ewt: num(COL.ewt),
  };
}

/** Serializes a validated V2 item into a 28-cell row (columns A..AB). */
function receiptItemV2ToRow(item: ReceiptItemV2): (string | number)[] {
  const s = (v?: string | number) => (v == null || v === "" ? "" : v);
  return [
    item.receiptItemId,
    item.liquidationId,
    item.date,
    item.description,
    item.miscellaneousCode,
    String(item.amount),
    item.receiptImageUrl,
    s(item.siNumber),
    s(item.siDate),
    s(item.drNumber),
    s(item.drDate),
    s(item.crNumber),
    s(item.crDate),
    s(item.bsNumber),
    s(item.bsDate),
    s(item.orNumber),
    s(item.orDate),
    s(item.othersDate),
    s(item.refNo),
    s(item.tin),
    s(item.supplierName),
    s(item.address),
    s(item.checkNo),
    s(item.cvNo),
    s(item.particulars),
    item.grossAmount != null ? String(item.grossAmount) : "",
    item.vat != null ? String(item.vat) : "",
    item.ewt != null ? String(item.ewt) : "",
  ];
}

async function getAllLiquidationsRaw(): Promise<Liquidation[]> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_LIQUIDATIONS,
  });
  const rows = res.data.values || [];
  return rows
    .map((row) => ({
      liquidationId: (row[0] || "").toString().trim(),
      controlNo: (row[1] || "").toString().trim(),
      userId: (row[2] || "").toString().trim(),
      totalAmount: parseFloat((row[3] || "0").toString().trim()) || 0,
      status: (row[4] || "").toString().trim(),
      approvedByUserId: (row[5] || "").toString().trim(),
      approvedByName: (row[6] || "").toString().trim(),
      approvedBySignatureUrl: (row[7] || "").toString().trim(),
      approvedDate: (row[8] || "").toString().trim(),
      approvalComment: (row[9] || "").toString().trim(),
      totalAmountRequested: (row[10] || "").toString().trim()
        ? parseFloat((row[10] || "0").toString().trim())
        : undefined,
    }))
    .filter((entry) => entry.liquidationId.length > 0);
}

async function getAllReceiptItemsRaw(): Promise<ReceiptItemV2[]> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_RECEIPT_ITEMS,
  });
  const rows = res.data.values || [];
  return rows
    .map((row) => rowToReceiptItemV2(row))
    .filter((entry) => entry.receiptItemId.length > 0);
}
// ── Public readers ──

export async function getAllLiquidationsV2(): Promise<Liquidation[]> {
  await ensureLiquidationV2Sheets();
  const cacheKey = "liqv2:liquidations";
  const cached = cacheGet<Liquidation[]>(cacheKey);
  if (cached !== undefined) return cached;
  const liquidations = await getAllLiquidationsRaw();
  cacheSet(cacheKey, liquidations);
  return liquidations;
}

export async function getAllReceiptItemsV2(): Promise<ReceiptItemV2[]> {
  await ensureLiquidationV2Sheets();
  const cacheKey = "liqv2:receiptItems";
  const cached = cacheGet<ReceiptItemV2[]>(cacheKey);
  if (cached !== undefined) return cached;
  const items = await getAllReceiptItemsRaw();
  cacheSet(cacheKey, items);
  return items;
}

export async function getLiquidationsByUserV2(
  userId: string,
): Promise<Liquidation[]> {
  const all = await getAllLiquidationsV2();
  return all.filter((entry) => entry.userId === userId.trim());
}

export async function getLiquidationByIdV2(
  liquidationId: string,
): Promise<Liquidation | undefined> {
  const all = await getAllLiquidationsV2();
  return all.find((entry) => entry.liquidationId === liquidationId);
}

export async function getLiquidationFullV2(
  liquidationId: string,
): Promise<LiquidationFullV2 | null> {
  const [liquidation, items] = await Promise.all([
    getLiquidationByIdV2(liquidationId),
    getAllReceiptItemsV2(),
  ]);
  if (!liquidation) return null;
  return {
    ...liquidation,
    items: items.filter((item) => item.liquidationId === liquidationId),
  };
}

export async function getLiquidationFullByControlNoForUserV2(
  userId: string,
  controlNo: string,
): Promise<LiquidationFullV2 | null> {
  const userIdTrimmed = userId.trim();
  const controlNoTrimmed = controlNo.trim();
  const [liquidations, items] = await Promise.all([
    getAllLiquidationsV2(),
    getAllReceiptItemsV2(),
  ]);
  const liquidation = liquidations.find(
    (entry) =>
      entry.userId === userIdTrimmed && entry.controlNo === controlNoTrimmed,
  );
  if (!liquidation) return null;
  return {
    ...liquidation,
    items: items.filter(
      (item) => item.liquidationId === liquidation.liquidationId,
    ),
  };
}

export async function getLiquidationsFullByUserV2(
  userId: string,
): Promise<LiquidationFullV2[]> {
  const [liquidations, items] = await Promise.all([
    getLiquidationsByUserV2(userId),
    getAllReceiptItemsV2(),
  ]);
  return liquidations.map((liquidation) => ({
    ...liquidation,
    items: items.filter(
      (item) => item.liquidationId === liquidation.liquidationId,
    ),
  }));
}

// ── Validation ──

function validateItemsV2(
  items: ReceiptItemV2Input[],
): (ReceiptItemV2Input & { description: string })[] {
  if (!items || items.length === 0) {
    throw new Error("At least one receipt item is required.");
  }
  return items.map((item) => {
    const miscellaneousCode = (item.miscellaneousCode || "")
      .toString()
      .trim();
    if (!miscellaneousCode) {
      throw new Error(
        "Miscellaneous code is required for every receipt item.",
      );
    }
    const amount = parseFloat(String(item.amount));
    if (isNaN(amount) || amount < 0) {
      throw new Error("Amount must be a non-negative number.");
    }
    if (!item.date) {
      throw new Error("Date is required for every receipt item.");
    }
    if (!item.description || !item.description.trim()) {
      throw new Error("Description is required for every receipt item.");
    }
    const num = (v?: number) =>
      v == null || isNaN(parseFloat(String(v)))
        ? undefined
        : Math.round((parseFloat(String(v)) || 0) * 100) / 100;
    return {
      date: item.date,
      description: item.description.trim().toUpperCase(),
      miscellaneousCode,
      amount: Math.round(amount * 100) / 100,
      receiptImageUrl: (item.receiptImageUrl || "").trim(),
      siNumber: (item.siNumber || "").toString().trim(),
      siDate: (item.siDate || "").toString().trim(),
      drNumber: (item.drNumber || "").toString().trim(),
      drDate: (item.drDate || "").toString().trim(),
      crNumber: (item.crNumber || "").toString().trim(),
      crDate: (item.crDate || "").toString().trim(),
      bsNumber: (item.bsNumber || "").toString().trim(),
      bsDate: (item.bsDate || "").toString().trim(),
      orNumber: (item.orNumber || "").toString().trim(),
      orDate: (item.orDate || "").toString().trim(),
      othersDate: (item.othersDate || "").toString().trim(),
      refNo: (item.refNo || "").toString().trim(),
      tin: (item.tin || "").toString().trim(),
      supplierName: (item.supplierName || "").toString().trim(),
      address: (item.address || "").toString().trim(),
      checkNo: (item.checkNo || "").toString().trim(),
      cvNo: (item.cvNo || "").toString().trim(),
      particulars: (item.particulars || "").toString().trim(),
      grossAmount: num(item.grossAmount),
      vat: num(item.vat),
      ewt: num(item.ewt),
    };
  });
}

// ── Writers ──
export async function createLiquidationDraftV2(input: {
  userId: string;
  controlNo: string;
  totalAmountRequested?: number;
}): Promise<Liquidation> {
  await ensureLiquidationV2Sheets();
  const controlNo = (input.controlNo || "").toString().trim();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const manual = parseFloat(String(input.totalAmountRequested ?? "0"));
  const totalAmountRequested = isNaN(manual) || manual < 0 ? 0 : manual;

  const liquidation: Liquidation = {
    liquidationId: generateUUID(),
    controlNo,
    userId: input.userId,
    totalAmount: 0,
    totalAmountRequested: controlNo === "" ? totalAmountRequested : undefined,
    status: "SAVED",
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!A:K`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          liquidation.liquidationId,
          liquidation.controlNo,
          liquidation.userId,
          String(liquidation.totalAmount),
          liquidation.status,
          "",
          "",
          "",
          "",
          "",
          controlNo === "" ? String(totalAmountRequested) : "",
        ],
      ],
    },
  });

  invalidateV2Cache();
  return liquidation;
}

export async function updateLiquidationRequestedAmountV2(
  liquidationId: string,
  totalAmountRequested: number,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllLiquidationsV2();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found`);
  const sheets = await getSheetsClient();
  const safe = Math.max(0, parseFloat(String(totalAmountRequested)) || 0);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!K${idx + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[String(safe)]] },
  });
  invalidateV2Cache();
}
/** Builds a fully-typed ReceiptItemV2 from a validated input + a fresh ID. */
function toReceiptItemV2(
  item: ReceiptItemV2Input & { description: string },
  liquidationId: string,
): ReceiptItemV2 {
  return {
    receiptItemId: generateUUID(),
    liquidationId,
    date: item.date,
    description: item.description,
    category: item.miscellaneousCode,
    miscellaneousCode: item.miscellaneousCode,
    amount: item.amount,
    receiptImageUrl: item.receiptImageUrl || "",
    siNumber: item.siNumber || "",
    siDate: item.siDate || "",
    drNumber: item.drNumber || "",
    drDate: item.drDate || "",
    crNumber: item.crNumber || "",
    crDate: item.crDate || "",
    bsNumber: item.bsNumber || "",
    bsDate: item.bsDate || "",
    orNumber: item.orNumber || "",
    orDate: item.orDate || "",
    othersDate: item.othersDate || "",
    refNo: item.refNo || "",
    tin: item.tin || "",
    supplierName: item.supplierName || "",
    address: item.address || "",
    checkNo: item.checkNo || "",
    cvNo: item.cvNo || "",
    particulars: item.particulars || "",
    grossAmount: item.grossAmount ?? 0,
    vat: item.vat ?? 0,
    ewt: item.ewt ?? 0,
  };
}

export async function addReceiptItemsV2(
  liquidationId: string,
  itemsToAdd: ReceiptItemV2Input[],
): Promise<{ liquidation: Liquidation; added: ReceiptItemV2[] }> {
  const liquidation = await getLiquidationByIdV2(liquidationId);
  if (!liquidation) throw new Error(`Liquidation ${liquidationId} not found.`);
  const status = (liquidation.status || "SAVED").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot add items: liquidation status is "${liquidation.status}".`,
    );
  }

  const validItems = validateItemsV2(itemsToAdd);
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const added = validItems.map((item) => toReceiptItemV2(item, liquidationId));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${RECEIPT_ITEMS_SHEET}!A:AB`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: added.map((item) => receiptItemV2ToRow(item)),
    },
  });

  const allItems = await getAllReceiptItemsV2();
  const total = allItems
    .filter((item) => item.liquidationId === liquidationId)
    .reduce((sum, item) => sum + item.amount, 0);

  const all = await getAllLiquidationsV2();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!D${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(total)]] },
    });
  }

  invalidateV2Cache();
  const refreshed = await getLiquidationByIdV2(liquidationId);
  if (!refreshed) throw new Error("Failed to reload liquidation.");
  return { liquidation: refreshed, added };
}

export async function replaceReceiptItemsV2(
  liquidationId: string,
  itemsToSave: ReceiptItemV2Input[],
): Promise<Liquidation> {
  const liquidation = await getLiquidationByIdV2(liquidationId);
  if (!liquidation) throw new Error(`Liquidation ${liquidationId} not found.`);
  const status = (liquidation.status || "SAVED").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot edit items: liquidation status is "${liquidation.status}".`,
    );
  }

  // Validate BEFORE deleting any existing rows (mirrors production behavior —
  // never wipe rows first, which caused permanent data loss).
  const validItems = itemsToSave.length > 0 ? validateItemsV2(itemsToSave) : [];

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const receiptRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_RECEIPT_ITEMS,
  });
  const receiptRows = receiptRes.data.values || [];
  const rowNumbers: number[] = [];
  receiptRows.forEach((row, i) => {
    if ((row[1] || "").toString().trim() === liquidationId) {
      rowNumbers.push(i + 2);
    }
  });
  await deleteSheetRows(RECEIPT_ITEMS_SHEET, rowNumbers);

  if (validItems.length > 0) {
    const added = validItems.map((item) => toReceiptItemV2(item, liquidationId));
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${RECEIPT_ITEMS_SHEET}!A:AB`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: added.map((item) => receiptItemV2ToRow(item)),
      },
    });
  }

  const allItems = await getAllReceiptItemsV2();
  const total = allItems
    .filter((item) => item.liquidationId === liquidationId)
    .reduce((sum, item) => sum + item.amount, 0);
  const all = await getAllLiquidationsV2();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!D${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(total)]] },
    });
  }

  invalidateV2Cache();
  const refreshed = await getLiquidationByIdV2(liquidationId);
  if (!refreshed) throw new Error("Failed to reload liquidation.");
  return refreshed;
}
/** Resolve configured approver for a requester (mirrors production, no FTI dep). */
export async function resolveApproverForRequesterV2(
  userId: string,
): Promise<{ approverUserId: string } | null> {
  try {
    const [{ getApproverForRequester }, { getUsers }] = await Promise.all([
      import("@/lib/userApproverSheets"),
      import("@/lib/userSheets"),
    ]);
    const users = await getUsers().catch(() => []);
    const user = users.find((u) => u.userId === userId);
    if (!user) return null;
    const mapping = await getApproverForRequester(userId, user.departmentId);
    return mapping ? { approverUserId: mapping.approverUserId } : null;
  } catch {
    return null;
  }
}

export async function updateLiquidationStatusV2(
  liquidationId: string,
  status: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllLiquidationsV2();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found`);
  const rowNumber = idx + 2;
  const sheets = await getSheetsClient();

  if (status.toUpperCase() === "SUBMITTED") {
    const current = all[idx];
    if (current && !current.approvedByUserId) {
      const approver = await resolveApproverForRequesterV2(current.userId);
      if (approver) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LIQUIDATIONS_SHEET}!E${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[status]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LIQUIDATIONS_SHEET}!F${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[approver.approverUserId]] },
        });
        invalidateV2Cache();
        return;
      }
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
  invalidateV2Cache();
}

export async function updateLiquidationApprovalV2(
  liquidationId: string,
  action: "approve" | "request_change" | "reject",
  approvedByUserId: string,
  approvedByName?: string,
  approvedBySignatureUrl?: string,
  comment?: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllLiquidationsV2();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found`);
  const rowNumber = idx + 2;
  const sheets = await getSheetsClient();

  const status =
    action === "approve"
      ? "APPROVED"
      : action === "request_change"
        ? "REQUESTED_FOR_CHANGE"
        : "REJECTED";
  const dateApproved = new Date().toISOString().replace("T", " ").slice(0, 19);
  const isApprove = action === "approve";

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!F${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? approvedByUserId : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!G${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? approvedByName || "" : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!H${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? approvedBySignatureUrl || "" : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!I${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[isApprove ? dateApproved : ""]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!J${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[comment || ""]] },
  });

  invalidateV2Cache();
}

export async function deleteLiquidationV2(
  liquidationId: string,
  requestingUserId: string,
): Promise<void> {
  const all = await getAllLiquidationsV2();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found.`);

  const liquidation = all[idx];
  if (liquidation.userId !== requestingUserId) {
    throw new Error("You can only delete your own liquidations.");
  }
  const status = (liquidation.status || "").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot delete liquidation with status "${liquidation.status}". Only SAVED or REQUESTED_FOR_CHANGE liquidations can be deleted.`,
    );
  }

  const receiptItems = await getAllReceiptItemsV2();
  const receiptRowNumbers: number[] = [];
  receiptItems.forEach((item, i) => {
    if (item.liquidationId === liquidationId) {
      receiptRowNumbers.push(i + 2);
    }
  });
  if (receiptRowNumbers.length > 0) {
    await deleteSheetRows(RECEIPT_ITEMS_SHEET, receiptRowNumbers);
  }

  const liquidationRowNumber = idx + 2;
  await deleteSheetRows(LIQUIDATIONS_SHEET, [liquidationRowNumber]);

  invalidateV2Cache();
}
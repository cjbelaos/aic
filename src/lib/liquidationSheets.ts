import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  Liquidation,
  LiquidationFull,
  ReceiptItem,
  ReceiptItemInput,
} from "@/types/liquidation";

// ── Constants ──
const LIQUIDATIONS_SHEET = "Liquidations";
const RECEIPT_ITEMS_SHEET = "ReceiptItems";
const RANGE_LIQUIDATIONS = `${LIQUIDATIONS_SHEET}!A2:O`; // A=liquidationId, B=controlNo, C=userId, D=totalAmount, E=status, F=approvedByUserId, G=approvedByName, H=approvedBySignatureUrl, I=approvedDate, J=approvalComment, K=totalAmountRequested, L=createdBy, M=createdAt, N=updatedBy, O=updatedAt
const RANGE_RECEIPT_ITEMS = `${RECEIPT_ITEMS_SHEET}!A2:AF`; // A=receiptItemId, B=liquidationId, C=date, D=description, E=miscellaneousCode, F=amount, G=receiptImageUrl, …:AB extended receipt columns, AC=createdBy, AD=createdAt, AE=updatedBy, AF=updatedAt

// ── Simple TTL Cache (matches ftiSheets.ts pattern) ──
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

function invalidateLiquidationCache(): void {
  for (const [key] of cache) {
    if (
      key.startsWith("liq:liquidations") ||
      key.startsWith("liq:receiptItems")
    ) {
      cache.delete(key);
    }
  }
}

// ── Helpers ──
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Touches the audit columns (N=UpdatedBy, O=UpdatedAt) of a Liquidations row.
 */
async function touchLiquidationAuditColumns(
  rowNumber: number,
  updatedBy: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const updatedAt = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!N${rowNumber}:O${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[updatedBy || "System", updatedAt]] },
  });
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
  invalidateLiquidationCache();
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
      // ── Audit columns (L..O) ──
      createdBy: (row[11] || "").toString().trim() || undefined,
      createdAt: (row[12] || "").toString().trim() || undefined,
      updatedBy: (row[13] || "").toString().trim() || undefined,
      updatedAt: (row[14] || "").toString().trim() || undefined,
    }))
    .filter((entry) => entry.liquidationId.length > 0);
}

async function getAllReceiptItemsRaw(): Promise<ReceiptItem[]> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_RECEIPT_ITEMS,
  });
  const rows = res.data.values || [];
  return rows
    .map((row) => {
      const parseStr = (idx: number) =>
        (row[idx] || "").toString().trim() || undefined;
      const parseNum = (idx: number) => {
        const str = (row[idx] || "").toString().trim();
        if (!str) return undefined;
        const val = parseFloat(str);
        return isNaN(val) ? undefined : val;
      };

      return {
        receiptItemId: (row[0] || "").toString().trim(),
        liquidationId: (row[1] || "").toString().trim(),
        date: (row[2] || "").toString().trim(),
        description: (row[3] || "").toString().trim(),
        category: (row[4] || "").toString().trim(),
        amount: parseFloat((row[5] || "0").toString().trim()) || 0,
        receiptImageUrl: (row[6] || "").toString().trim(),
        siNumber: parseStr(7),
        siDate: parseStr(8),
        drNumber: parseStr(9),
        drDate: parseStr(10),
        crNumber: parseStr(11),
        crDate: parseStr(12),
        bsNumber: parseStr(13),
        bsDate: parseStr(14),
        orNumber: parseStr(15),
        orDate: parseStr(16),
        othersDate: parseStr(17),
        refNo: parseStr(18),
        tin: parseStr(19),
        supplierName: parseStr(20),
        address: parseStr(21),
        checkNo: parseStr(22),
        cvNo: parseStr(23),
        particulars: parseStr(24),
        grossAmount: parseNum(25),
        vat: parseNum(26),
        ewt: parseNum(27),
        // ── Audit columns (AC..AF) ──
        createdBy: parseStr(28),
        createdAt: parseStr(29),
        updatedBy: parseStr(30),
        updatedAt: parseStr(31),
      };
    })
    .filter((entry) => entry.receiptItemId.length > 0);
}

// ── Public readers ──

export async function getAllLiquidations(): Promise<Liquidation[]> {
  const cacheKey = "liq:liquidations";
  const cached = cacheGet<Liquidation[]>(cacheKey);
  if (cached !== undefined) return cached;
  const liquidations = await getAllLiquidationsRaw();
  cacheSet(cacheKey, liquidations);
  return liquidations;
}

export async function getAllReceiptItems(): Promise<ReceiptItem[]> {
  const cacheKey = "liq:receiptItems";
  const cached = cacheGet<ReceiptItem[]>(cacheKey);
  if (cached !== undefined) return cached;
  const items = await getAllReceiptItemsRaw();
  cacheSet(cacheKey, items);
  return items;
}

export async function getLiquidationsByUser(
  userId: string,
): Promise<Liquidation[]> {
  const all = await getAllLiquidations();
  return all.filter((entry) => entry.userId === userId.trim());
}

export async function getLiquidationById(
  liquidationId: string,
): Promise<Liquidation | undefined> {
  const all = await getAllLiquidations();
  return all.find((entry) => entry.liquidationId === liquidationId);
}

/**
 * Reads a single liquidation directly from the sheet, bypassing the TTL cache.
 * Used by write paths immediately after creating a row, because the warm cache
 * can lag behind the just-appended row (Google Sheets eventual consistency),
 * which otherwise surfaces as a spurious "Liquidation ... not found" on the
 * next request (e.g. add-item right after create for an "Other" liquidation).
 */
export async function getLiquidationByIdFresh(
  liquidationId: string,
): Promise<Liquidation | undefined> {
  const all = await getAllLiquidationsRaw();
  return all.find((entry) => entry.liquidationId === liquidationId);
}

/**
 * Read a liquidation for a write operation using a cache-bypassing read, with a
 * longer retry + backoff to absorb Google Sheets' eventual-consistency delay
 * right after a create/append. Throws a clear error (with diagnostics) only if
 * it still cannot be found.
 */
async function readLiquidationForWrite(
  liquidationId: string,
  attempts = 6,
): Promise<Liquidation> {
  const delaysMs = [0, 100, 200, 400, 800, 1000];
  for (let i = 0; i < attempts; i++) {
    const liquidation = await getLiquidationByIdFresh(liquidationId);
    if (liquidation) return liquidation;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delaysMs[i] ?? 400));
    }
  }
  // Diagnostics: log what the sheet actually contains so we can tell whether
  // the row was appended but is unmapped/unreadable vs. genuinely absent.
  try {
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_LIQUIDATIONS,
    });
    const rows = res.data.values || [];
    console.error(
      `[liquidation] NOT FOUND ${liquidationId} after ${attempts} fresh reads. ` +
        `Liquidations sheet has ${rows.length} data rows. ` +
        `Any-column match: ${rows.some((r) =>
          r.some((cell) => (cell || "").toString().trim() === liquidationId,
          ))}. Column-A ids: ${rows
          .slice(0, 5)
          .map((r) => (r[0] || "").toString().trim())
          .join(", ")}...`,
    );
  } catch (diagError) {
    console.error(
      `[liquidation] NOT FOUND ${liquidationId} — diagnostics unavailable:`,
      diagError,
    );
  }
  throw new Error(`Liquidation ${liquidationId} not found.`);
}

/** Liquidation joined with its receipt items (for the history page). */
export async function getLiquidationFull(
  liquidationId: string,
): Promise<LiquidationFull | null> {
  const [liquidation, items] = await Promise.all([
    getLiquidationById(liquidationId),
    getAllReceiptItems(),
  ]);
  if (!liquidation) return null;
  return {
    ...liquidation,
    items: items.filter((item) => item.liquidationId === liquidationId),
  };
}

/**
 * Returns the user's liquidation (with its receipt items) for a given FTI
 * ControlNo. Enforces the data relation: one FTI control no → one liquidation,
 * and one liquidation → many receipt items.
 */
export async function getLiquidationFullByControlNoForUser(
  userId: string,
  controlNo: string,
): Promise<LiquidationFull | undefined> {
  const [liquidations, items] = await Promise.all([
    getLiquidationsByUser(userId.trim()),
    getAllReceiptItems(),
  ]);
  const liquidation = liquidations.find(
    (entry) =>
      entry.controlNo === (controlNo || "").toString().trim() &&
      entry.userId === userId.trim(),
  );
  if (!liquidation) return undefined;
  return {
    ...liquidation,
    items: items.filter(
      (item) => item.liquidationId === liquidation.liquidationId,
    ),
  };
}

export async function getLiquidationsFullByUser(
  userId: string,
): Promise<LiquidationFull[]> {
  const [liquidations, items] = await Promise.all([
    getLiquidationsByUser(userId),
    getAllReceiptItems(),
  ]);
  return liquidations.map((liquidation) => ({
    ...liquidation,
    items: items.filter(
      (item) => item.liquidationId === liquidation.liquidationId,
    ),
  }));
}

// ── Validation ──
// Categories are no longer restricted to the legacy hardcoded list. The
// liquidation form sources them dynamically from the Miscellaneous sheet
// (same as the FTI page). Hardcoding the old set caused updates with new
// categories (e.g. "Meal Allowance", "Emergency Cash") to fail — after
// rows had already been deleted — permanently losing receipt data.
function validateItems(items: ReceiptItemInput[]): ReceiptItemInput[] {
  if (!items || items.length === 0) {
    throw new Error("At least one receipt item is required.");
  }

  return items.map((item) => {
    const category = (item.category || "").toString().trim();
    if (!category) {
      throw new Error("Category is required for every receipt item.");
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

    const sanitizeText = (val?: string) => {
      const trimmed = (val || "").toString().trim();
      return trimmed ? trimmed.toUpperCase() : undefined;
    };

    const sanitizeDate = (val?: string) => {
      const trimmed = (val || "").toString().trim();
      return trimmed ? trimmed : undefined;
    };

    const sanitizeNum = (val?: number | string) => {
      if (val === undefined || val === null || val === "") return undefined;
      const parsed = parseFloat(String(val));
      if (isNaN(parsed) || parsed < 0) return undefined;
      return Math.round(parsed * 100) / 100;
    };

    return {
      date: item.date,
      description: item.description.trim().toUpperCase(),
      category,
      amount: Math.round(amount * 100) / 100,
      receiptImageUrl: (item.receiptImageUrl || "").trim(),
      siNumber: sanitizeText(item.siNumber),
      siDate: sanitizeDate(item.siDate),
      drNumber: sanitizeText(item.drNumber),
      drDate: sanitizeDate(item.drDate),
      crNumber: sanitizeText(item.crNumber),
      crDate: sanitizeDate(item.crDate),
      bsNumber: sanitizeText(item.bsNumber),
      bsDate: sanitizeDate(item.bsDate),
      orNumber: sanitizeText(item.orNumber),
      orDate: sanitizeDate(item.orDate),
      othersDate: sanitizeDate(item.othersDate),
      refNo: sanitizeText(item.refNo),
      tin: sanitizeText(item.tin),
      supplierName: sanitizeText(item.supplierName),
      address: sanitizeText(item.address),
      checkNo: sanitizeText(item.checkNo),
      cvNo: sanitizeText(item.cvNo),
      particulars: (item.particulars || "").toString().trim() || undefined,
      grossAmount: sanitizeNum(item.grossAmount),
      vat: sanitizeNum(item.vat),
      ewt: sanitizeNum(item.ewt),
    };
  });
}

function mapReceiptItemToRow(
  item: ReceiptItem,
  updatedBy = "System",
  updatedAt = new Date().toISOString(),
  createdBy = updatedBy,
  createdAt = updatedAt,
): string[] {
  return [
    item.receiptItemId,
    item.liquidationId,
    item.date,
    item.description,
    item.category,
    String(item.amount),
    item.receiptImageUrl || "",
    item.siNumber || "",
    item.siDate || "",
    item.drNumber || "",
    item.drDate || "",
    item.crNumber || "",
    item.crDate || "",
    item.bsNumber || "",
    item.bsDate || "",
    item.orNumber || "",
    item.orDate || "",
    item.othersDate || "",
    item.refNo || "",
    item.tin || "",
    item.supplierName || "",
    item.address || "",
    item.checkNo || "",
    item.cvNo || "",
    item.particulars || "",
    item.grossAmount !== undefined && item.grossAmount !== null
      ? String(item.grossAmount)
      : "",
    item.vat !== undefined && item.vat !== null ? String(item.vat) : "",
    item.ewt !== undefined && item.ewt !== null ? String(item.ewt) : "",
    // ── Audit columns (AC..AF) ──
    createdBy, // AC CreatedBy
    createdAt, // AD CreatedAt
    updatedBy, // AE UpdatedBy
    updatedAt, // AF UpdatedAt
  ];
}

// ── Writers ──

/**
 * Creates the Liquidations parent row with status SAVED. Called the first
 * time the technician clicks "Add Item" for a ControlNo. Subsequent "Add
 * Item" clicks append receipt items to the ReceiptItems sheet instead.
 */
export async function createLiquidationDraft(input: {
  userId: string;
  controlNo: string;
  /** Manually entered amount for "Other" (no ControlNo) liquidations. Ignored when a ControlNo exists. */
  totalAmountRequested?: number;
}): Promise<Liquidation> {
  // Enforce one FTI ControlNo → one liquidation. If the technician already
  // has an EDITABLE liquidation for this ControlNo, return it instead of
  // creating a duplicate parent row (this is the source of the original bug
  // where re-selecting an FTI showed an empty receipt list).
  //
  // IMPORTANT: only reuse a draft that can still accept items. For "Other"
  // (no-ControlNo) liquidations, controlNo is "" and it is shared by every
  // "Other" liquidation — reusing a SUBMITTED/APPROVED one here caused
  // addReceiptItems to reject ("liquidation status is SUBMITTED") and
  // surface as a 400 on a brand-new liquidation. So we only return an
  // existing row when it is still editable.
  //
  // CRITICAL: the reuse below is ONLY valid when there is a real, unique FTI
  // ControlNo. For empty ControlNo ("Other") we ALWAYS create a fresh SAVED
  // draft below rather than reusing, because "" is shared by every "Other".
  const controlNo = (input.controlNo || "").toString().trim();
  // ── Reuse (FTI-linked only) ──
  if (controlNo) {
    const existing = (await getLiquidationsByUser(input.userId)).find(
      (entry) =>
        entry.controlNo === controlNo &&
        ["SAVED", "REQUESTED_FOR_CHANGE"].includes(
          (entry.status || "").toUpperCase(),
        ),
    );
    if (existing) return existing;
  }

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  // When a ControlNo exists the TotalAmountRequested comes from the FTI's
  // TotalAmount. Otherwise it is manually provided by the user.
  let totalAmountRequested: number | undefined;
  if (controlNo) {
    const { getAllFTIRequests } = await import("@/lib/ftiSheets");
    const requests = await getAllFTIRequests().catch(() => []);
    const matched = requests.find((r) => r.controlNo === controlNo);
    totalAmountRequested = matched?.totalAmount ?? undefined;
  } else {
    const manual = parseFloat(String(input.totalAmountRequested ?? "0"));
    totalAmountRequested = isNaN(manual) || manual < 0 ? 0 : manual;
  }

  const now = new Date().toISOString();
  const liquidation: Liquidation = {
    liquidationId: generateUUID(),
    controlNo: (input.controlNo || "").toString().trim(),
    userId: input.userId,
    totalAmount: 0,
    totalAmountRequested,
    status: "SAVED",
    createdBy: input.userId,
    createdAt: now,
    updatedBy: input.userId,
    updatedAt: now,
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!A:O`,
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
          totalAmountRequested !== undefined
            ? String(totalAmountRequested)
            : "",
          liquidation.createdBy,
          liquidation.createdAt,
          liquidation.updatedBy,
          liquidation.updatedAt,
        ],
      ],
    },
  });

  invalidateLiquidationCache();
  return liquidation;
}

/**
 * Updates TotalAmountRequested (column K) for a liquidation. Used to persist
 * the manual amount for "Other" liquidations or to sync from the FTI once a
 * ControlNo is later assigned.
 */
export async function updateLiquidationRequestedAmount(
  liquidationId: string,
  totalAmountRequested: number,
  updatedBy = "System",
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllLiquidations();
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
  await touchLiquidationAuditColumns(idx + 2, updatedBy);
  invalidateLiquidationCache();
}

/**
 * Appends receipt items (ReceiptItems sheet) for a SAVED liquidation and
 * recomputes the parent TotalAmount (Liquidations column D).
 */
export async function addReceiptItems(
  liquidationId: string,
  itemsToAdd: ReceiptItemInput[],
  updatedBy = "System",
): Promise<{ liquidation: Liquidation; added: ReceiptItem[] }> {
  const liquidation = await readLiquidationForWrite(liquidationId);
  const status = (liquidation.status || "SAVED").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot add items: liquidation status is "${liquidation.status}".`,
    );
  }

  const validItems = validateItems(itemsToAdd);
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const who = updatedBy || "System";
  const now = new Date().toISOString();
  const added: ReceiptItem[] = validItems.map((item) => ({
    receiptItemId: generateUUID(),
    liquidationId,
    date: item.date,
    description: item.description,
    category: item.category,
    amount: item.amount,
    receiptImageUrl: item.receiptImageUrl || "",
    siNumber: item.siNumber,
    siDate: item.siDate,
    drNumber: item.drNumber,
    drDate: item.drDate,
    crNumber: item.crNumber,
    crDate: item.crDate,
    bsNumber: item.bsNumber,
    bsDate: item.bsDate,
    orNumber: item.orNumber,
    orDate: item.orDate,
    othersDate: item.othersDate,
    refNo: item.refNo,
    tin: item.tin,
    supplierName: item.supplierName,
    address: item.address,
    checkNo: item.checkNo,
    cvNo: item.cvNo,
    particulars: item.particulars,
    grossAmount: item.grossAmount,
    vat: item.vat,
    ewt: item.ewt,
  }));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${RECEIPT_ITEMS_SHEET}!A:AF`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: added.map((it) => mapReceiptItemToRow(it, who, now)),
    },
  });

  // Use cache-bypassing reads for the recompute so the just-appended item and
  // parent row are always included regardless of the TTL cache state.
  invalidateLiquidationCache();
  const allItems = await getAllReceiptItemsRaw();
  const total = allItems
    .filter((item) => item.liquidationId === liquidationId)
    .reduce((sum, item) => sum + (item.grossAmount ?? item.amount ?? 0), 0);

  const all = await getAllLiquidationsRaw();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!D${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(total)]] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!N${idx + 2}:O${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[who, now]] },
    });
  }

  invalidateLiquidationCache();
  const refreshed = all.find(
    (entry) => entry.liquidationId === liquidationId,
  );
  if (!refreshed) throw new Error("Failed to reload liquidation.");
  return { liquidation: refreshed, added };
}

/**
 * Replaces all receipt items of a liquidation with the given list and
 * recomputes the parent TotalAmount. Only SAVED / REQUESTED_FOR_CHANGE
 * liquidations can be edited.
 */
export async function replaceReceiptItems(
  liquidationId: string,
  itemsToSave: ReceiptItemInput[],
  updatedBy = "System",
): Promise<Liquidation> {
  const liquidation = await readLiquidationForWrite(liquidationId);
  const status = (liquidation.status || "SAVED").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot edit items: liquidation status is "${liquidation.status}".`,
    );
  }

  // IMPORTANT: Validate BEFORE deleting any existing rows. If validation
  // fails we must abort with the old data still intact, never wipe rows
  // first (that caused permanent receipt-data loss on failed updates).
  const validItems = itemsToSave.length > 0 ? validateItems(itemsToSave) : [];

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const who = updatedBy || "System";
  const now = new Date().toISOString();

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
    const who = updatedBy || "System";
  const now = new Date().toISOString();
  const added: ReceiptItem[] = validItems.map((item) => ({
      receiptItemId: generateUUID(),
      liquidationId,
      date: item.date,
      description: item.description,
      category: item.category,
      amount: item.amount,
      receiptImageUrl: item.receiptImageUrl || "",
      siNumber: item.siNumber,
      siDate: item.siDate,
      drNumber: item.drNumber,
      drDate: item.drDate,
      crNumber: item.crNumber,
      crDate: item.crDate,
      bsNumber: item.bsNumber,
      bsDate: item.bsDate,
      orNumber: item.orNumber,
      orDate: item.orDate,
      othersDate: item.othersDate,
      refNo: item.refNo,
      tin: item.tin,
      supplierName: item.supplierName,
      address: item.address,
      checkNo: item.checkNo,
      cvNo: item.cvNo,
      particulars: item.particulars,
      grossAmount: item.grossAmount,
      vat: item.vat,
      ewt: item.ewt,
    }));
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${RECEIPT_ITEMS_SHEET}!A:AF`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: added.map((it) =>
          mapReceiptItemToRow(
            it,
            who,
            now,
            liquidation.createdBy || who,
            liquidation.createdAt || now,
          ),
        ),
      },
    });
  }

  const allItems = await getAllReceiptItemsRaw();
  const total = allItems
    .filter((item) => item.liquidationId === liquidationId)
    .reduce((sum, item) => sum + (item.grossAmount ?? item.amount ?? 0), 0);
  const all = await getAllLiquidationsRaw();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!D${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(total)]] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!N${idx + 2}:O${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[who, now]] },
    });
  }

  invalidateLiquidationCache();
  const refreshed = all.find(
    (entry) => entry.liquidationId === liquidationId,
  );
  if (!refreshed) throw new Error("Failed to reload liquidation.");
  return refreshed;
}

/** Resolve configured approver for a requester (mirrors FTI). */
export async function resolveApproverForRequester(userId: string): Promise<{
  approverUserId: string;
} | null> {
  try {
    const [{ getApproverForRequester }, { getUsers }] = await Promise.all([
      import("@/lib/userApproverSheets"),
      import("@/lib/userSheets"),
    ]);
    const users = await getUsers().catch(() => []);
    const user = users.find((u) => u.userId === userId);
    if (!user) return null;
    const mapping = await getApproverForRequester(
      userId,
      user.departmentId,
      "LIQUIDATION",
    );
    return mapping ? { approverUserId: mapping.approverUserId } : null;
  } catch {
    return null;
  }
}

/** Update Liquidations status (E). SUBMITTED auto-assigns approver (F). */
export async function updateLiquidationStatus(
  liquidationId: string,
  status: string,
  updatedBy = "System",
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllLiquidations();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found`);
  const rowNumber = idx + 2;
  const sheets = await getSheetsClient();
  await touchLiquidationAuditColumns(rowNumber, updatedBy);

  if (status.toUpperCase() === "SUBMITTED") {
    const current = all[idx];
    if (current && !current.approvedByUserId) {
      // Approval exemption: users flagged "does not require approval" have
      // their liquidation auto-approved on submission, without an approver.
      const { getUsers } = await import("@/lib/userSheets");
      const users = await getUsers().catch(() => []);
      const requester = users.find((u) => u.userId === current.userId);

      if (requester && requester.requiresApproval === false) {
        const approvedDate = new Date()
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LIQUIDATIONS_SHEET}!E${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["APPROVED"]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LIQUIDATIONS_SHEET}!F${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[current.userId]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LIQUIDATIONS_SHEET}!G${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[requester.fullName]] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LIQUIDATIONS_SHEET}!I${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[approvedDate]] },
        });
        invalidateLiquidationCache();
        return;
      }

      const approver = await resolveApproverForRequester(current.userId);
      if (!approver) {
        throw new Error(
          "No approver is configured for this user. Contact your administrator before submitting.",
        );
      }
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
      invalidateLiquidationCache();
      return;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
  invalidateLiquidationCache();
}

/** Approve / request-change / reject a liquidation (mirrors FTI). */
export async function updateLiquidationApproval(
  liquidationId: string,
  action: "approve" | "request_change" | "reject",
  approvedByUserId: string,
  approvedByName?: string,
  approvedBySignatureUrl?: string,
  comment?: string,
): Promise<void> {
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const all = await getAllLiquidations();
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
  await touchLiquidationAuditColumns(rowNumber, approvedByUserId);

  invalidateLiquidationCache();
}

/**
 * Updates the ControlNo (column B) on an existing liquidation. Allows the
 * user to fix a mistake where they created a liquidation with the wrong FTI
 * linkage (e.g. "Other" when it should be FTI-linked, or vice versa).
 * Only SAVED or REQUESTED_FOR_CHANGE liquidations can be updated.
 * When switching from FTI-linked to "Other" (empty controlNo), the
 * totalAmountRequested is cleared so the user can enter a manual amount.
 * When switching to an FTI, totalAmountRequested is auto-filled from the
 * FTI's totalAmount (the enrichment on read handles this, but we also
 * persist it here for consistency).
 */
export async function updateLiquidationControlNo(
  liquidationId: string,
  newControlNo: string,
  requestingUserId: string,
): Promise<void> {
  const all = await getAllLiquidations();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found.`);

  const liquidation = all[idx];

  // Ownership check
  if (liquidation.userId !== requestingUserId) {
    throw new Error("You can only update your own liquidations.");
  }

  // Status check
  const status = (liquidation.status || "").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot update FTI linkage: liquidation status is "${liquidation.status}". Only SAVED or REQUESTED_FOR_CHANGE liquidations can be updated.`,
    );
  }

  // Duplicate check — prevent linking to an FTI ControlNo already used by
  // another liquidation (different liquidationId). Empty controlNo ("Other")
  // is always allowed — multiple liquidations can have no FTI.
  const trimmed = newControlNo.trim();
  if (trimmed) {
    const existing = all.find(
      (entry) =>
        entry.controlNo === trimmed && entry.liquidationId !== liquidationId,
    );
    if (existing) {
      throw new Error(
        `FTI ControlNo "${trimmed}" is already linked to another liquidation (${existing.liquidationId.slice(0, 8)}…). Each FTI can only be linked to one liquidation.`,
      );
    }
  }

  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const rowNumber = idx + 2;

  // Update ControlNo (column B)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!B${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newControlNo]] },
  });

  // If switching to an FTI, auto-fill totalAmountRequested from the FTI.
  // If switching to "Other" (no FTI), clear totalAmountRequested.
  if (trimmed) {
    const { getAllFTIRequests } = await import("@/lib/ftiSheets");
    const requests = await getAllFTIRequests().catch(() => []);
    const matched = requests.find((r) => r.controlNo === trimmed);
    const ftiAmount = matched?.totalAmount;
    if (ftiAmount != null && ftiAmount > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${LIQUIDATIONS_SHEET}!K${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[String(ftiAmount)]] },
      });
    }
  } else {
    // Clear totalAmountRequested for "Other" liquidations
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LIQUIDATIONS_SHEET}!K${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[""]] },
    });
  }

  await touchLiquidationAuditColumns(rowNumber, requestingUserId);
  invalidateLiquidationCache();
}

/**
 * Deletes a liquidation (parent row + all child receipt items) from the
 * Google Sheet. Only the original owner can delete their own liquidation
 * when it's in SAVED or REQUESTED_FOR_CHANGE status.
 */
export async function deleteLiquidation(
  liquidationId: string,
  requestingUserId: string,
): Promise<void> {
  const all = await getAllLiquidations();
  const idx = all.findIndex((entry) => entry.liquidationId === liquidationId);
  if (idx === -1) throw new Error(`Liquidation ${liquidationId} not found.`);

  const liquidation = all[idx];

  // Ownership check
  if (liquidation.userId !== requestingUserId) {
    throw new Error("You can only delete your own liquidations.");
  }

  // Status check — only allow delete for drafts / change-requested
  const status = (liquidation.status || "").toUpperCase();
  if (!["SAVED", "REQUESTED_FOR_CHANGE"].includes(status)) {
    throw new Error(
      `Cannot delete liquidation with status "${liquidation.status}". Only SAVED or REQUESTED_FOR_CHANGE liquidations can be deleted.`,
    );
  }

  // 1. Delete all receipt items for this liquidation
  const receiptItems = await getAllReceiptItems();
  const receiptRowNumbers: number[] = [];
  receiptItems.forEach((item, i) => {
    // Row index = i + 2 (header + 1-based)
    if (item.liquidationId === liquidationId) {
      receiptRowNumbers.push(i + 2);
    }
  });
  if (receiptRowNumbers.length > 0) {
    await deleteSheetRows(RECEIPT_ITEMS_SHEET, receiptRowNumbers);
  }

  // 2. Delete the liquidation parent row
  const liquidationRowNumber = idx + 2;
  await deleteSheetRows(LIQUIDATIONS_SHEET, [liquidationRowNumber]);

  invalidateLiquidationCache();
}

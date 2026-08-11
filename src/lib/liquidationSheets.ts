import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  Liquidation,
  LiquidationFull,
  NewLiquidationInput,
  ReceiptItem,
  ReceiptItemInput,
} from "@/types/liquidation";

// ── Constants ──
const LIQUIDATIONS_SHEET = "Liquidations";
const RECEIPT_ITEMS_SHEET = "ReceiptItems";
const RANGE_LIQUIDATIONS = `${LIQUIDATIONS_SHEET}!A2:C`; // A=liquidationId, B=userId, C=totalAmount
const RANGE_RECEIPT_ITEMS = `${RECEIPT_ITEMS_SHEET}!A2:G`; // A=receiptItemId, B=liquidationId, C=date, D=description, E=category, F=amount, G=receiptImageUrl

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
      userId: (row[1] || "").toString().trim(),
      totalAmount: parseFloat((row[2] || "0").toString().trim()) || 0,
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
    .map((row) => ({
      receiptItemId: (row[0] || "").toString().trim(),
      liquidationId: (row[1] || "").toString().trim(),
      date: (row[2] || "").toString().trim(),
      description: (row[3] || "").toString().trim(),
      category: (row[4] || "").toString().trim(),
      amount: parseFloat((row[5] || "0").toString().trim()) || 0,
      receiptImageUrl: (row[6] || "").toString().trim(),
    }))
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

export async function getLiquidationsFullByUser(
  userId: string,
): Promise<LiquidationFull[]> {
  const [liquidations, items] = await Promise.all([
    getLiquidationsByUser(userId),
    getAllReceiptItems(),
  ]);
  return liquidations.map((liquidation) => ({
    ...liquidation,
    items: items.filter((item) => item.liquidationId === liquidation.liquidationId),
  }));
}

// ── Writers ──

/**
 * Validates and normalizes the client-supplied receipt items.
 * Throws on empty batches or invalid category values.
 */
function validateItems(items: ReceiptItemInput[]): ReceiptItemInput[] {
  if (!items || items.length === 0) {
    throw new Error("At least one receipt item is required.");
  }

  const validCategories = new Set([
    "Meal",
    "Fare",
    "Materials",
    "Fuel",
    "Hotel",
    "Others",
  ]);

  return items.map((item) => {
    const category = (item.category || "").toString().trim();
    if (!validCategories.has(category)) {
      throw new Error(`Invalid category "${category}".`);
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
    return {
      date: item.date,
      description: item.description.trim().toUpperCase(),
      category,
      amount: Math.round(amount * 100) / 100,
      receiptImageUrl: (item.receiptImageUrl || "").trim(),
    };
  });
}

/**
 * Creates a new liquidation (parent row) plus its receipt items (child rows).
 *
 * - LiquidationId: generated UUID.
 * - TotalAmount: live sum of all receipt item amounts.
 * - Each ReceiptItemId: generated UUID.
 * - ReceiptImageUrl: the public Drive URL returned by the upload endpoint.
 *
 * Writes are intentionally sequenced (parent first) so the child rows always
 * reference an existing parent key.
 */
export async function createLiquidation(input: NewLiquidationInput): Promise<{
  liquidation: Liquidation;
  items: ReceiptItem[];
}> {
  const items = validateItems(input.items);
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();

  const liquidation: Liquidation = {
    liquidationId: generateUUID(),
    userId: input.userId,
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${LIQUIDATIONS_SHEET}!A:C`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          liquidation.liquidationId,
          liquidation.userId,
          String(liquidation.totalAmount),
        ],
      ],
    },
  });

  const receiptItems: ReceiptItem[] = items.map((item) => ({
    receiptItemId: generateUUID(),
    liquidationId: liquidation.liquidationId,
    date: item.date,
    description: item.description,
    category: item.category,
    amount: item.amount,
    receiptImageUrl: item.receiptImageUrl || "",
  }));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${RECEIPT_ITEMS_SHEET}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: receiptItems.map((item) => [
        item.receiptItemId,
        item.liquidationId,
        item.date,
        item.description,
        item.category,
        String(item.amount),
        item.receiptImageUrl,
      ]),
    },
  });

  invalidateLiquidationCache();
  return { liquidation, items: receiptItems };
}
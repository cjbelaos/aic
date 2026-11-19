// Inventory domain rules (stock on hand per product per warehouse).
//
// Pure helpers shared by the Sheets layer, the service, the API routes and the
// pages. Keep this module free of "@/" imports so the focused tests can compile it.
//
// Balances are derived, never stored: manual entries and transfers come from the
// StockMovements log, outs come straight from counted Delivery Receipt lines.

import { format } from "date-fns";
import { parseDeliveryDate } from "../deliverySerials.ts";
import { isExecutivePositionTitle } from "../positionUtils.ts";

export type MovementType = "OPENING" | "RECEIVED" | "RETURN" | "ADJUSTMENT" | "TRANSFER_OUT" | "TRANSFER_IN";
export type AccessLevel = "view" | "operate" | "manage";
export type LineResult = "ok" | "needs_approval" | "blocked";

export interface StockMovement {
  movementId: string;
  date: string;
  warehouseId: string;
  productId: string;
  /** Signed quantity: positive adds stock, negative removes it. */
  qty: number;
  type: MovementType;
  sourceType: "ENTRY" | "TRANSFER";
  sourceId: string;
  referenceNo: string;
  note: string;
  status: "active" | "void";
  createdBy: string;
  createdAt: string;
}

export interface DrStockLine {
  drNumber: number;
  date: string;
  status: string;
  warehouseId: string;
  productId: string;
  quantity: number;
}

export interface SafetyStockRow {
  warehouseId: string;
  productId: string;
  qty: number;
}

export interface StockBalance {
  warehouseId: string;
  productId: string;
  openingDate: string | null;
  onHand: number;
  safetyStock: number;
  available: number;
}

export interface LineCheck {
  productId: string;
  requested: number;
  onHand: number;
  safetyStock: number;
  available: number;
  result: LineResult;
  safetyUsed: number;
  shortfall: number;
}

export interface StockCheck {
  result: LineResult;
  lines: LineCheck[];
}

export type InventoryAction =
  | "entry:OPENING"
  | "entry:RECEIVED"
  | "entry:RETURN"
  | "entry:ADJUSTMENT"
  | "entry:void"
  | "safety:set"
  | "transfer:create"
  | "transfer:cancel"
  | "approval:decide";

export const COUNTED_DR_STATUSES: readonly string[] = ["created", "printed", "completed"];

export function isCountedDrStatus(status: string): boolean {
  return COUNTED_DR_STATUSES.includes(String(status ?? "").trim().toLowerCase());
}

export function toIsoDate(raw: string): string | null {
  const date = parseDeliveryDate(raw);
  return date ? format(date, "yyyy-MM-dd") : null;
}

export function stockKey(warehouseId: string, productId: string): string {
  return `${warehouseId}|${productId}`;
}

export function computeBalances(input: {
  movements: StockMovement[];
  drLines: DrStockLine[];
  safety: SafetyStockRow[];
  trackedProductIds: ReadonlySet<string>;
  exclude?: { drNumber?: number; transferId?: string };
}): Map<string, StockBalance> {
  const { trackedProductIds, exclude } = input;
  const relevant = (warehouseId: string, productId: string) =>
    Boolean(warehouseId) && Boolean(productId) && trackedProductIds.has(productId);

  const active = input.movements.filter(
    (m) =>
      m.status !== "void" &&
      relevant(m.warehouseId, m.productId) &&
      !(exclude?.transferId && m.sourceType === "TRANSFER" && m.sourceId === exclude.transferId),
  );

  const balances = new Map<string, StockBalance>();
  const ensure = (warehouseId: string, productId: string): StockBalance => {
    const key = stockKey(warehouseId, productId);
    let balance = balances.get(key);
    if (!balance) {
      balance = { warehouseId, productId, openingDate: null, onHand: 0, safetyStock: 0, available: 0 };
      balances.set(key, balance);
    }
    return balance;
  };

  for (const m of active) {
    if (m.type !== "OPENING") continue;
    const date = toIsoDate(m.date);
    const balance = ensure(m.warehouseId, m.productId);
    if (date && (!balance.openingDate || date < balance.openingDate)) balance.openingDate = date;
  }

  const counts = (balance: StockBalance, rawDate: string) => {
    const date = toIsoDate(rawDate);
    return balance.openingDate !== null && date !== null && date >= balance.openingDate;
  };

  for (const m of active) {
    const balance = ensure(m.warehouseId, m.productId);
    if (counts(balance, m.date)) balance.onHand += m.qty;
  }

  for (const line of input.drLines) {
    if (!relevant(line.warehouseId, line.productId) || !isCountedDrStatus(line.status)) continue;
    if (exclude?.drNumber !== undefined && line.drNumber === exclude.drNumber) continue;
    const balance = ensure(line.warehouseId, line.productId);
    if (counts(balance, line.date)) balance.onHand -= line.quantity;
  }

  for (const row of input.safety) {
    if (!relevant(row.warehouseId, row.productId)) continue;
    ensure(row.warehouseId, row.productId).safetyStock = row.qty;
  }

  for (const balance of balances.values()) balance.available = balance.onHand - balance.safetyStock;
  return balances;
}

const RESULT_RANK: Record<LineResult, number> = { ok: 0, needs_approval: 1, blocked: 2 };

export function checkLines(
  balances: Map<string, StockBalance>,
  warehouseId: string,
  lines: { productId?: string; quantity: number }[],
  trackedProductIds: ReadonlySet<string>,
): StockCheck {
  const requestedByProduct = new Map<string, number>();
  for (const line of lines) {
    const productId = String(line.productId ?? "").trim();
    if (!productId || !trackedProductIds.has(productId)) continue;
    requestedByProduct.set(productId, (requestedByProduct.get(productId) ?? 0) + (Number(line.quantity) || 0));
  }

  const checked: LineCheck[] = [];
  let result: LineResult = "ok";
  for (const [productId, requested] of requestedByProduct) {
    const balance = balances.get(stockKey(warehouseId, productId));
    const onHand = balance?.onHand ?? 0;
    const safetyStock = balance?.safetyStock ?? 0;
    const available = onHand - safetyStock;
    const lineResult: LineResult = requested > onHand ? "blocked" : requested > available ? "needs_approval" : "ok";
    checked.push({
      productId,
      requested,
      onHand,
      safetyStock,
      available,
      result: lineResult,
      safetyUsed: lineResult === "needs_approval" ? requested - Math.max(available, 0) : 0,
      shortfall: lineResult === "blocked" ? requested - onHand : 0,
    });
    if (RESULT_RANK[lineResult] > RESULT_RANK[result]) result = lineResult;
  }
  return { result, lines: checked };
}

export function resolveDocumentStatus(input: {
  requested: string;
  check: StockCheck;
  level: AccessLevel;
}): { status: string; selfApproved: boolean } | { error: string } {
  const requested = String(input.requested ?? "").trim().toLowerCase();
  if (requested === "draft") return { status: "draft", selfApproved: false };
  if (input.check.result === "blocked") return { error: "Not enough stock to save this document." };
  if (input.check.result === "needs_approval") {
    return input.level === "manage"
      ? { status: requested, selfApproved: true }
      : { status: "pending_approval", selfApproved: false };
  }
  return { status: requested, selfApproved: false };
}

function normalizeTitle(value: string): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, " ");
}

export function accessLevelFor(input: { positionTitle: string; superAdmin: boolean }): AccessLevel {
  if (input.superAdmin) return "manage";
  const title = normalizeTitle(input.positionTitle);
  if (title.includes("manager") || isExecutivePositionTitle(title)) return "manage";
  if (title === "staff" || title === "tech admin") return "operate";
  return "view";
}

const OPERATE_ACTIONS: ReadonlySet<InventoryAction> = new Set<InventoryAction>([
  "entry:OPENING",
  "entry:RECEIVED",
  "entry:RETURN",
  "transfer:create",
  "transfer:cancel",
]);

export function canPerform(level: AccessLevel, action: InventoryAction): boolean {
  if (level === "manage") return true;
  if (level === "operate") return OPERATE_ACTIONS.has(action);
  return false;
}

export function dateBeforeOpening(
  balances: Map<string, StockBalance>,
  warehouseId: string,
  productId: string,
  date: string,
): boolean {
  const openingDate = balances.get(stockKey(warehouseId, productId))?.openingDate;
  const iso = toIsoDate(date);
  return Boolean(openingDate && iso && iso < openingDate);
}

export type EntryType = "OPENING" | "RECEIVED" | "RETURN" | "ADJUSTMENT";

export interface EntryInput {
  type: EntryType;
  warehouseId: string;
  date: string;
  note: string;
  lines: { productId: string; qty: number }[];
}

/**
 * Validates a manual stock entry against current balances.
 * Returns the products that need an automatic zero OPENING first (a first-ever
 * RECEIVED/RETURN for a warehouse+product), or the reason the entry is refused.
 */
export function validateEntry(
  input: EntryInput,
  balances: Map<string, StockBalance>,
  trackedProductIds: ReadonlySet<string>,
  label: (productId: string) => string = (id) => id,
): { error: string } | { needsOpening: string[] } {
  if (!input.warehouseId) return { error: "Choose a warehouse." };
  const date = toIsoDate(input.date);
  if (!date) return { error: "Enter a valid date." };
  if (!input.lines.length) return { error: "Add at least one product." };
  if (input.type === "ADJUSTMENT" && !input.note.trim()) return { error: "A note is required for adjustments." };

  const seen = new Set<string>();
  const needsOpening: string[] = [];
  for (const line of input.lines) {
    const name = label(line.productId);
    if (!trackedProductIds.has(line.productId)) return { error: `${name} is not in a category that tracks inventory.` };
    const qty = Number(line.qty);
    if (!Number.isFinite(qty)) return { error: `Enter a quantity for ${name}.` };
    if (input.type === "ADJUSTMENT") {
      if (qty === 0) return { error: `The adjustment for ${name} cannot be 0.` };
    } else if (input.type === "OPENING" ? qty < 0 : qty <= 0) {
      return { error: input.type === "OPENING" ? `The opening count for ${name} cannot be negative.` : `The quantity for ${name} must be greater than 0.` };
    }
    if (input.type === "OPENING" && seen.has(line.productId)) return { error: `${name} is listed more than once.` };
    seen.add(line.productId);

    const balance = balances.get(stockKey(input.warehouseId, line.productId));
    const openingDate = balance?.openingDate ?? null;
    if (input.type === "OPENING") {
      if (openingDate) return { error: `${name} already has an opening count at this warehouse. Use an adjustment for a recount.` };
      continue;
    }
    if (!openingDate) {
      if (input.type === "ADJUSTMENT") return { error: `Enter the opening count for ${name} at this warehouse first.` };
      if (!needsOpening.includes(line.productId)) needsOpening.push(line.productId);
      continue;
    }
    if (date < openingDate) return { error: `${name} cannot be dated before its opening count (${openingDate}).` };
  }

  if (input.type === "ADJUSTMENT") {
    const change = new Map<string, number>();
    for (const line of input.lines) change.set(line.productId, (change.get(line.productId) ?? 0) + Number(line.qty));
    for (const [productId, delta] of change) {
      const onHand = balances.get(stockKey(input.warehouseId, productId))?.onHand ?? 0;
      if (onHand + delta < 0) return { error: `This adjustment would take ${label(productId)} below zero (${onHand} on hand).` };
    }
  }
  return { needsOpening };
}

/** Reason a movement cannot be voided, or null. */
export function validateVoid(
  movement: StockMovement,
  balances: Map<string, StockBalance>,
  label: (productId: string) => string = (id) => id,
): string | null {
  if (movement.status === "void") return "This entry is already void.";
  if (movement.sourceType === "TRANSFER") return "This line belongs to a stock transfer. Cancel the transfer instead.";
  if (movement.type === "OPENING" || movement.qty <= 0) return null;
  const onHand = balances.get(stockKey(movement.warehouseId, movement.productId))?.onHand ?? 0;
  if (onHand - movement.qty < 0) {
    return `Voiding this entry would take ${label(movement.productId)} below zero (${onHand} on hand).`;
  }
  return null;
}

/** Shape checks for a transfer; stock is checked separately with checkLines. */
export function validateTransferInput(
  input: { fromWarehouseId: string; toWarehouseId: string; date: string; items: { productId: string; qty: number }[] },
  trackedProductIds: ReadonlySet<string>,
  label: (productId: string) => string = (id) => id,
): string | null {
  if (!input.fromWarehouseId || !input.toWarehouseId) return "Choose both warehouses.";
  if (input.fromWarehouseId === input.toWarehouseId) return "Choose two different warehouses.";
  if (!toIsoDate(input.date)) return "Enter a valid date.";
  if (!input.items.length) return "Add at least one product.";
  for (const item of input.items) {
    const name = label(item.productId);
    if (!trackedProductIds.has(item.productId)) return `${name} is not in a category that tracks inventory.`;
    if (!(Number(item.qty) > 0)) return `The quantity for ${name} must be greater than 0.`;
  }
  return null;
}

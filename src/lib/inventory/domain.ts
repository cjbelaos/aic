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

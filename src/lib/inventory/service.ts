import { getProductsOnly } from "@/lib/productSheets";
import { getWarehouses } from "@/lib/warehouseSheets";
import { withInventoryLock } from "@/lib/inventory/lock";
import { lineSources, validateLineSources, type WarehouseSource } from "@/lib/deliverySources";
import {
  appendMovements,
  listDrStockLines,
  listMovements,
  listSafetyStock,
  listTrackedProductIds,
  listTransfers,
  saveTransfer,
  setMovementStatus,
  upsertSafetyStock,
  type StockTransfer,
} from "@/lib/inventory/sheets";
import {
  canPerform,
  checkLines,
  computeBalances,
  dateBeforeOpening,
  drCheckLines,
  resolveDocumentStatus,
  stockKey,
  toIsoDate,
  validateDrGuardInput,
  validateEntry,
  validateTransferInput,
  validateVoid,
  type AccessLevel,
  type EntryInput,
  type InventoryAction,
  type SafetyStockRow,
  type StockBalance,
  type StockCheck,
  type StockMovement,
} from "@/lib/inventory/domain";

// Inventory service: every write runs inside the inventory lock so the stock
// check and the write are one critical section across instances.

export class InventoryBlockedError extends Error {
  status = 409 as const;
  check?: StockCheck;
  constructor(message: string, check?: StockCheck) {
    super(message);
    this.check = check;
  }
}

export class InventoryForbiddenError extends Error {
  status = 403 as const;
}

export class InventoryValidationError extends Error {
  status = 422 as const;
}

type Actor = { userId: string; level: AccessLevel };
type Exclude = { drNumber?: number; transferId?: string };

function requireAction(actor: Actor, action: InventoryAction): void {
  if (!canPerform(actor.level, action)) throw new InventoryForbiddenError("You do not have permission for this inventory action.");
}

export async function loadBalances(exclude?: Exclude): Promise<{ balances: Map<string, StockBalance>; tracked: Set<string> }> {
  const [movements, drLines, safety, tracked] = await Promise.all([listMovements(), listDrStockLines(), listSafetyStock(), listTrackedProductIds()]);
  return { balances: computeBalances({ movements, drLines, safety, trackedProductIds: tracked, exclude }), tracked };
}

async function labels() {
  const [products, warehouses] = await Promise.all([getProductsOnly(), getWarehouses()]);
  const productById = new Map(products.map((p) => [p.productId, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.warehouseId, w]));
  return {
    products,
    warehouses,
    product: (id: string) => productById.get(id)?.productName || id,
    warehouse: (id: string) => warehouseById.get(id)?.name || id,
    productIdByCode: new Map(products.map((p) => [p.productCode.toLowerCase(), p.productId])),
    activeWarehouse: (id: string) => warehouseById.get(id)?.active === true,
  };
}

/** Message for the first blocked line, naming that line's warehouse. */
function blockedMessage(check: StockCheck, warehouseName: (id: string) => string, product: (id: string) => string): string {
  const line = check.lines.find((l) => l.result === "blocked");
  if (!line) return "Not enough stock.";
  return `Not enough stock at ${warehouseName(line.warehouseId)}: ${product(line.productId)} needs ${line.requested}, ${line.onHand} on hand`;
}

export async function previewCheck(input: { warehouseId: string; lines: { warehouseId?: string; productId?: string; productCode?: string; quantity: number }[]; exclude?: Exclude }): Promise<StockCheck> {
  const [{ balances, tracked }, names] = await Promise.all([loadBalances(input.exclude), labels()]);
  const lines = input.lines.map((l) => ({ warehouseId: l.warehouseId, productId: l.productId || names.productIdByCode.get(String(l.productCode ?? "").toLowerCase()) || "", quantity: l.quantity }));
  return checkLines(balances, input.warehouseId, lines, tracked);
}

/* ── Delivery receipts ─────────────────────────────────────────── */

const RESUBMIT_STATUSES = new Set(["pending_approval", "rejected"]);

/**
 * Stock guard for a DR save. Must run inside withInventoryLock together with the DR write.
 * Returns the status the DR must be saved with; throws InventoryBlockedError when it cannot be saved.
 */
export async function guardDrStock(input: {
  drNumber?: number;
  /** The DR's default warehouse; lines without sources take their full qty from it. */
  warehouseId: string;
  date: string;
  requestedStatus: string;
  items: { productId?: string; productCode?: string; quantity: number; sources?: WarehouseSource[] }[];
  level: AccessLevel;
}): Promise<{ status: string; selfApproved: boolean; check: StockCheck }> {
  const requested = String(input.requestedStatus || "created").trim().toLowerCase();
  if (requested === "draft") return { status: "draft", selfApproved: false, check: { result: "ok", lines: [] } };
  const [{ balances, tracked }, names] = await Promise.all([
    loadBalances(input.drNumber !== undefined ? { drNumber: input.drNumber } : undefined),
    labels(),
  ]);
  const items = input.items.map((item) => ({
    productId: item.productId || names.productIdByCode.get(String(item.productCode ?? "").toLowerCase()) || "",
    quantity: Number(item.quantity) || 0,
    sources: item.sources,
  }));
  const inputError = validateDrGuardInput({ date: input.date, lines: items }, tracked, names.product)
    ?? validateLineSources(
      items.map((item) => ({ productName: names.product(item.productId), quantity: item.quantity, tracked: Boolean(item.productId) && tracked.has(item.productId), sources: item.sources?.length ? item.sources : lineSources(item, input.warehouseId) })),
      names.activeWarehouse,
    );
  if (inputError) throw new InventoryValidationError(inputError);
  const parts = drCheckLines(items, input.warehouseId);
  for (const part of parts) {
    if (part.productId && tracked.has(part.productId) && dateBeforeOpening(balances, part.warehouseId, part.productId, input.date)) {
      const opening = balances.get(stockKey(part.warehouseId, part.productId))?.openingDate;
      throw new InventoryBlockedError(`${names.product(part.productId)} cannot be delivered before its opening count date (${opening}) at ${names.warehouse(part.warehouseId)}.`);
    }
  }
  const check = checkLines(balances, input.warehouseId, parts, tracked);
  const resolved = resolveDocumentStatus({
    requested: RESUBMIT_STATUSES.has(requested) ? "created" : requested,
    check,
    level: input.level,
  });
  if ("error" in resolved) throw new InventoryBlockedError(blockedMessage(check, names.warehouse, names.product), check);
  return { ...resolved, check };
}

/* ── Stock entries ─────────────────────────────────────────────── */

export async function createEntries(
  input: EntryInput & { referenceNo: string },
  actor: Actor,
): Promise<StockMovement[]> {
  requireAction(actor, `entry:${input.type}` as InventoryAction);
  return withInventoryLock(async () => {
    const [{ balances, tracked }, names] = await Promise.all([loadBalances(), labels()]);
    if (!names.activeWarehouse(input.warehouseId)) throw new InventoryValidationError("Choose an active warehouse.");
    const result = validateEntry(input, balances, tracked, names.product);
    if ("error" in result) throw new InventoryValidationError(result.error);
    const date = toIsoDate(input.date) as string;
    const now = new Date().toISOString();
    const base = { date, warehouseId: input.warehouseId, sourceType: "ENTRY" as const, sourceId: "", status: "active" as const, createdBy: actor.userId, createdAt: now };
    const zeroOpenings = result.needsOpening.map((productId) => ({ ...base, productId, qty: 0, type: "OPENING" as const, referenceNo: "", note: "Automatic zero opening (first stock in)" }));
    const entries = input.lines.map((line) => ({ ...base, productId: line.productId, qty: Number(line.qty), type: input.type, referenceNo: input.referenceNo.trim(), note: input.note.trim() }));
    const written = await appendMovements([...zeroOpenings, ...entries]);
    return written.slice(zeroOpenings.length);
  });
}

export async function voidEntry(movementId: string, actor: Actor): Promise<void> {
  requireAction(actor, "entry:void");
  await withInventoryLock(async () => {
    const movement = (await listMovements()).find((m) => m.movementId === movementId);
    if (!movement) throw new InventoryValidationError(`Stock entry "${movementId}" was not found.`);
    const [{ balances }, names] = await Promise.all([loadBalances(), labels()]);
    const reason = validateVoid(movement, balances, names.product);
    if (reason) throw new InventoryValidationError(reason);
    await setMovementStatus([movementId], "void", actor.userId);
  });
}

export async function setSafetyStock(row: SafetyStockRow, actor: Actor): Promise<void> {
  requireAction(actor, "safety:set");
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty < 0) throw new InventoryValidationError("Safety stock must be 0 or more.");
  const [tracked, names] = await Promise.all([listTrackedProductIds(), labels()]);
  if (!tracked.has(row.productId)) throw new InventoryValidationError(`${names.product(row.productId)} is not in a category that tracks inventory.`);
  if (!names.activeWarehouse(row.warehouseId)) throw new InventoryValidationError("Choose an active warehouse.");
  await upsertSafetyStock({ ...row, qty }, actor.userId);
}

/* ── Stock transfers ───────────────────────────────────────────── */

function transferMovements(transfer: StockTransfer, actor: string): Omit<StockMovement, "movementId">[] {
  const now = new Date().toISOString();
  const date = toIsoDate(transfer.date) as string;
  const base = { date, sourceType: "TRANSFER" as const, sourceId: transfer.transferId, referenceNo: transfer.transferNo, note: transfer.note, status: "active" as const, createdBy: actor, createdAt: now };
  return transfer.items.flatMap((item) => [
    { ...base, warehouseId: transfer.fromWarehouseId, productId: item.productId, qty: -item.qty, type: "TRANSFER_OUT" as const },
    { ...base, warehouseId: transfer.toWarehouseId, productId: item.productId, qty: item.qty, type: "TRANSFER_IN" as const },
  ]);
}

/** Checks the from-warehouse and opening dates on both sides; returns the zero openings the to-side needs. */
async function checkTransferStock(
  transfer: Pick<StockTransfer, "fromWarehouseId" | "toWarehouseId" | "date" | "items"> & { transferId?: string },
  level: AccessLevel,
): Promise<{ status: string; selfApproved: boolean; check: StockCheck; zeroOpenings: string[] }> {
  const [{ balances, tracked }, names] = await Promise.all([loadBalances(transfer.transferId ? { transferId: transfer.transferId } : undefined), labels()]);
  const zeroOpenings: string[] = [];
  for (const item of transfer.items) {
    if (dateBeforeOpening(balances, transfer.fromWarehouseId, item.productId, transfer.date) || dateBeforeOpening(balances, transfer.toWarehouseId, item.productId, transfer.date)) {
      throw new InventoryBlockedError(`${names.product(item.productId)} cannot be transferred before its opening count date.`);
    }
    if (!balances.get(stockKey(transfer.toWarehouseId, item.productId))?.openingDate && !zeroOpenings.includes(item.productId)) zeroOpenings.push(item.productId);
  }
  const check = checkLines(balances, transfer.fromWarehouseId, transfer.items.map((i) => ({ productId: i.productId, quantity: i.qty })), tracked);
  const resolved = resolveDocumentStatus({ requested: "created", check, level });
  if ("error" in resolved) throw new InventoryBlockedError(blockedMessage(check, names.warehouse, names.product), check);
  return { ...resolved, check, zeroOpenings };
}

async function postTransfer(transfer: StockTransfer, zeroOpenings: string[], actor: string): Promise<void> {
  const now = new Date().toISOString();
  const date = toIsoDate(transfer.date) as string;
  const openings = zeroOpenings.map((productId) => ({
    date, warehouseId: transfer.toWarehouseId, productId, qty: 0, type: "OPENING" as const, sourceType: "ENTRY" as const, sourceId: "",
    referenceNo: "", note: `Automatic zero opening (transfer ${transfer.transferNo})`, status: "active" as const, createdBy: actor, createdAt: now,
  }));
  await appendMovements([...openings, ...transferMovements(transfer, actor)]);
}

export async function createTransfer(
  input: { date: string; fromWarehouseId: string; toWarehouseId: string; preparedBy: string; note: string; items: { productId: string; qty: number; serialNumbers: string[] }[] },
  actor: Actor,
): Promise<StockTransfer> {
  requireAction(actor, "transfer:create");
  return withInventoryLock(async () => {
    const [tracked, names] = await Promise.all([listTrackedProductIds(), labels()]);
    const items = input.items.map((i) => ({ ...i, qty: Number(i.qty) }));
    const shapeError = validateTransferInput({ ...input, items }, tracked, names.product);
    if (shapeError) throw new InventoryValidationError(shapeError);
    if (!names.activeWarehouse(input.fromWarehouseId) || !names.activeWarehouse(input.toWarehouseId)) throw new InventoryValidationError("Both warehouses must be active.");
    const date = toIsoDate(input.date) as string;
    const guard = await checkTransferStock({ ...input, date, items }, actor.level);
    const now = new Date().toISOString();
    const transfer = await saveTransfer({
      date, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId,
      status: guard.status === "pending_approval" ? "pending_approval" : "created",
      preparedBy: input.preparedBy.trim(), note: input.note.trim(),
      approvedBy: guard.selfApproved ? actor.userId : "", approvedAt: guard.selfApproved ? now : "",
      approvalNote: guard.selfApproved ? "Self-approved (Manager)" : "",
      createdBy: actor.userId, createdAt: now, items,
    }, actor.userId);
    if (transfer.status === "created") await postTransfer(transfer, guard.zeroOpenings, actor.userId);
    return transfer;
  });
}

export async function cancelTransfer(transferId: string, actor: Actor): Promise<StockTransfer> {
  requireAction(actor, "transfer:cancel");
  return withInventoryLock(async () => {
    const transfer = (await listTransfers()).find((t) => t.transferId === transferId);
    if (!transfer) throw new InventoryValidationError(`Stock transfer "${transferId}" was not found.`);
    if (transfer.status === "cancelled" || transfer.status === "rejected") throw new InventoryValidationError(`This transfer is already ${transfer.status}.`);
    if (transfer.status === "created") {
      const [{ balances, tracked }, names] = await Promise.all([loadBalances(), labels()]);
      // Cancelling takes the stock back out of the receiving warehouse; it must still be there.
      const check = checkLines(balances, transfer.toWarehouseId, transfer.items.map((i) => ({ productId: i.productId, quantity: i.qty })), tracked);
      if (check.result === "blocked") throw new InventoryBlockedError(`Cannot cancel: ${blockedMessage(check, names.warehouse, names.product)}`, check);
      const ids = (await listMovements()).filter((m) => m.sourceType === "TRANSFER" && m.sourceId === transferId && m.status === "active").map((m) => m.movementId);
      await setMovementStatus(ids, "void", actor.userId);
    }
    return saveTransfer({ ...transfer, status: "cancelled" }, actor.userId);
  });
}

export async function decideTransfer(transferId: string, decision: "approve" | "reject", note: string, actor: Actor): Promise<StockTransfer> {
  requireAction(actor, "approval:decide");
  return withInventoryLock(async () => {
    const transfer = (await listTransfers()).find((t) => t.transferId === transferId);
    if (!transfer) throw new InventoryValidationError(`Stock transfer "${transferId}" was not found.`);
    if (transfer.status !== "pending_approval") throw new InventoryValidationError("Only a transfer waiting for approval can be approved or rejected.");
    const stamp = { approvedBy: actor.userId, approvedAt: new Date().toISOString(), approvalNote: note.trim() };
    if (decision === "reject") return saveTransfer({ ...transfer, ...stamp, status: "rejected" }, actor.userId);
    const guard = await checkTransferStock(transfer, "manage");
    const approved = await saveTransfer({ ...transfer, ...stamp, status: "created" }, actor.userId);
    await postTransfer(approved, guard.zeroOpenings, actor.userId);
    return approved;
  });
}

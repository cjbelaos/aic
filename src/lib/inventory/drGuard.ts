import { NextResponse } from "next/server";
import { getWarehouses } from "@/lib/warehouseSheets";
import { getAccessLevel } from "@/lib/inventory/access";
import { withInventoryLock, InventoryWriteConflict } from "@/lib/inventory/lock";
import { guardDrStock, InventoryBlockedError, InventoryForbiddenError, InventoryValidationError } from "@/lib/inventory/service";
import type { StockCheck } from "@/lib/inventory/domain";
import type { SessionUser } from "@/types/user";
import type { WarehouseSource } from "@/lib/deliverySources";

// Glue between the Delivery Receipt routes and the inventory service: one call
// runs the stock guard and the DR write inside the same inventory lock.

export const SELF_APPROVED_NOTE = "Self-approved (Manager)";

export async function activeWarehouseError(warehouseId: string | undefined): Promise<string | null> {
  if (!warehouseId?.trim()) return "Default warehouse is required.";
  const warehouse = (await getWarehouses()).find((w) => w.warehouseId === warehouseId);
  return warehouse?.active ? null : "Default warehouse must be an active warehouse.";
}

export interface DrStockDecision {
  status: string;
  selfApproved: boolean;
  check: StockCheck;
  /** Always fully set by the server: client-supplied approval fields are never trusted. */
  approval: { approvedBy: string; approvedAt: string; approvalNote: string };
  /** The status a held DR was saved for; "" when the DR is not held. */
  requestedStatus: string;
}

const NO_APPROVAL = { approvedBy: "", approvedAt: "", approvalNote: "" };

/**
 * Runs the stock guard for a DR and then `write` with the status the DR must be
 * saved with, both inside the inventory lock.
 */
export async function guardedDrWrite<T>(
  session: SessionUser,
  input: { drNumber?: number; warehouseId: string; date: string; requestedStatus: string; items: { productId?: string; productCode?: string; quantity: number; sources?: WarehouseSource[] }[] },
  write: (decision: DrStockDecision) => Promise<T>,
): Promise<{ result: T; decision: DrStockDecision }> {
  const requested = String(input.requestedStatus || "created").trim().toLowerCase();
  if (requested === "draft") {
    // A draft has no stock effect, so it neither needs nor waits for the lock.
    const decision: DrStockDecision = { status: "draft", selfApproved: false, check: { result: "ok", lines: [] }, approval: NO_APPROVAL, requestedStatus: "" };
    return { result: await write(decision), decision };
  }
  const level = await getAccessLevel(session);
  return withInventoryLock(async () => {
    const guard = await guardDrStock({ ...input, level });
    const decision: DrStockDecision = {
      ...guard,
      approval: guard.selfApproved
        ? { approvedBy: session.userId, approvedAt: new Date().toISOString(), approvalNote: SELF_APPROVED_NOTE }
        : NO_APPROVAL,
      requestedStatus: guard.status === "pending_approval" ? requested : "",
    };
    return { result: await write(decision), decision };
  });
}

/** Maps inventory errors to JSON responses; returns null for anything else. */
export function inventoryErrorResponse(error: unknown): Response | null {
  if (error instanceof InventoryBlockedError) return NextResponse.json({ error: error.message, check: error.check }, { status: 409 });
  if (error instanceof InventoryWriteConflict) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof InventoryForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof InventoryValidationError) return NextResponse.json({ error: error.message }, { status: 422 });
  return null;
}

// Inventory entry and transfer validation — focused tests.

import assert from "node:assert/strict";
import {
  computeBalances,
  validateEntry,
  validateTransferInput,
  validateVoid,
  type StockMovement,
} from "../../src/lib/inventory/domain.ts";

const tracked = new Set(["P1", "P2"]);
const label = (id: string) => `Product ${id}`;

function movement(partial: Partial<StockMovement>): StockMovement {
  return {
    movementId: "MOV-1", date: "2026-11-20", warehouseId: "W1", productId: "P1", qty: 10, type: "OPENING",
    sourceType: "ENTRY", sourceId: "", referenceNo: "", note: "", status: "active", createdBy: "U1", createdAt: "", ...partial,
  };
}
const balances = computeBalances({ movements: [movement({})], drLines: [], safety: [], trackedProductIds: tracked });
const errorOf = (result: { error: string } | { needsOpening: string[] }) => ("error" in result ? result.error : "");

// validateEntry: basic shape
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "2026-11-21", note: "", lines: [] }, balances, tracked, label)), /at least one/i);
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "", date: "2026-11-21", note: "", lines: [{ productId: "P1", qty: 1 }] }, balances, tracked, label)), /warehouse/i);
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "nope", note: "", lines: [{ productId: "P1", qty: 1 }] }, balances, tracked, label)), /date/i);
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P3", qty: 1 }] }, balances, tracked, label)), /Product P3.*not.*track/i);
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P1", qty: 0 }] }, balances, tracked, label)), /greater than 0/i);
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P1", qty: -2 }] }, balances, tracked, label)), /greater than 0/i);

// validateEntry: OPENING rules
assert.match(errorOf(validateEntry({ type: "OPENING", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P1", qty: 5 }] }, balances, tracked, label)), /already has an opening count/i);
assert.deepEqual(validateEntry({ type: "OPENING", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P2", qty: 0 }] }, balances, tracked, label), { needsOpening: [] });
assert.match(errorOf(validateEntry({ type: "OPENING", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P2", qty: 1 }, { productId: "P2", qty: 2 }] }, balances, tracked, label)), /more than once/i);

// validateEntry: dates before the opening are refused
assert.match(errorOf(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "2026-11-19", note: "", lines: [{ productId: "P1", qty: 1 }] }, balances, tracked, label)), /before.*opening/i);

// validateEntry: a first receipt with no opening asks for an automatic zero opening
assert.deepEqual(validateEntry({ type: "RECEIVED", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P2", qty: 3 }] }, balances, tracked, label), { needsOpening: ["P2"] });
assert.deepEqual(validateEntry({ type: "RETURN", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P1", qty: 3 }] }, balances, tracked, label), { needsOpening: [] });

// validateEntry: ADJUSTMENT rules
assert.match(errorOf(validateEntry({ type: "ADJUSTMENT", warehouseId: "W1", date: "2026-11-21", note: "", lines: [{ productId: "P1", qty: -1 }] }, balances, tracked, label)), /note/i);
assert.match(errorOf(validateEntry({ type: "ADJUSTMENT", warehouseId: "W1", date: "2026-11-21", note: "damaged", lines: [{ productId: "P1", qty: 0 }] }, balances, tracked, label)), /cannot be 0/i);
assert.deepEqual(validateEntry({ type: "ADJUSTMENT", warehouseId: "W1", date: "2026-11-21", note: "damaged", lines: [{ productId: "P1", qty: -10 }] }, balances, tracked, label), { needsOpening: [] });
assert.match(errorOf(validateEntry({ type: "ADJUSTMENT", warehouseId: "W1", date: "2026-11-21", note: "damaged", lines: [{ productId: "P1", qty: -11 }] }, balances, tracked, label)), /below zero/i);
assert.match(errorOf(validateEntry({ type: "ADJUSTMENT", warehouseId: "W1", date: "2026-11-21", note: "found", lines: [{ productId: "P2", qty: 1 }] }, balances, tracked, label)), /opening count/i);

// validateVoid
assert.equal(validateVoid(movement({ movementId: "MOV-2", type: "RECEIVED", qty: 4, date: "2026-11-21" }), balances, label), null);
{
  const withReceipt = computeBalances({
    movements: [movement({}), movement({ movementId: "MOV-2", type: "RECEIVED", qty: 4, date: "2026-11-21" })],
    drLines: [{ drNumber: 1, date: "2026-11-22", status: "created", warehouseId: "W1", productId: "P1", quantity: 12 }],
    safety: [], trackedProductIds: tracked,
  });
  assert.match(validateVoid(movement({ movementId: "MOV-2", type: "RECEIVED", qty: 4, date: "2026-11-21" }), withReceipt, label) ?? "", /below zero/i);
}
assert.match(validateVoid(movement({ movementId: "MOV-3", type: "TRANSFER_OUT", qty: -1, sourceType: "TRANSFER", sourceId: "TRF-1" }), balances, label) ?? "", /cancel the transfer/i);
assert.match(validateVoid(movement({ status: "void" }), balances, label) ?? "", /already void/i);

// validateTransferInput
const transfer = { fromWarehouseId: "W1", toWarehouseId: "W2", date: "2026-11-21", items: [{ productId: "P1", qty: 2 }] };
assert.equal(validateTransferInput(transfer, tracked, label), null);
assert.match(validateTransferInput({ ...transfer, toWarehouseId: "W1" }, tracked, label) ?? "", /different/i);
assert.match(validateTransferInput({ ...transfer, items: [] }, tracked, label) ?? "", /at least one/i);
assert.match(validateTransferInput({ ...transfer, items: [{ productId: "P1", qty: 0 }] }, tracked, label) ?? "", /greater than 0/i);
assert.match(validateTransferInput({ ...transfer, items: [{ productId: "P3", qty: 1 }] }, tracked, label) ?? "", /not.*track/i);
assert.match(validateTransferInput({ ...transfer, date: "" }, tracked, label) ?? "", /date/i);

console.log("inventory validation tests passed.");

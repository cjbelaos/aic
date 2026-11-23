// Inventory domain — focused tests.
//
// Balances are derived from stock movements, counted DR lines and safety stock.
// These tests pin the rules the spec fixes: which DRs count, the opening-date
// cutoff, the ok / needs approval / blocked classification and access levels.

import assert from "node:assert/strict";
import {
  accessLevelFor,
  canPerform,
  checkLines,
  computeBalances,
  drCheckLines,
  dateBeforeOpening,
  isCountedDrStatus,
  resolveDocumentStatus,
  stockKey,
  toIsoDate,
  type DrStockLine,
  type SafetyStockRow,
  type StockMovement,
} from "../../src/lib/inventory/domain.ts";

const tracked = new Set(["P1", "P2"]);

function movement(partial: Partial<StockMovement>): StockMovement {
  return {
    movementId: "MOV-000001",
    date: "2026-11-20",
    warehouseId: "W1",
    productId: "P1",
    qty: 0,
    type: "RECEIVED",
    sourceType: "ENTRY",
    sourceId: "",
    referenceNo: "",
    note: "",
    status: "active",
    createdBy: "U1",
    createdAt: "2026-11-20T00:00:00Z",
    ...partial,
  };
}

const opening = movement({ movementId: "MOV-1", type: "OPENING", qty: 10 });
const safety: SafetyStockRow[] = [{ warehouseId: "W1", productId: "P1", qty: 4 }];

function dr(partial: Partial<DrStockLine>): DrStockLine {
  return { drNumber: 1, date: "2026-11-21", status: "created", warehouseId: "W1", productId: "P1", quantity: 3, ...partial };
}

function balanceOf(movements: StockMovement[], drLines: DrStockLine[], exclude?: { drNumber?: number; transferId?: string }) {
  return computeBalances({ movements, drLines, safety, trackedProductIds: tracked, exclude });
}

// isCountedDrStatus normalises
assert.equal(isCountedDrStatus(" Completed"), true);
assert.equal(isCountedDrStatus("printed"), true);
assert.equal(isCountedDrStatus("created"), true);
for (const status of ["pending_approval", "draft", "cancelled", "deleted", "void", "rejected"]) {
  assert.equal(isCountedDrStatus(status), false, status);
}

// toIsoDate handles sheet formats
assert.equal(toIsoDate("11/19/2026"), "2026-11-19");
assert.equal(toIsoDate("2026-11-19"), "2026-11-19");
assert.equal(toIsoDate("1/5/2026"), "2026-01-05");
assert.equal(toIsoDate("x"), null);

// computeBalances basic
{
  const b = balanceOf([opening], [dr({})]).get(stockKey("W1", "P1"));
  assert.deepEqual(
    { onHand: b?.onHand, safetyStock: b?.safetyStock, available: b?.available, openingDate: b?.openingDate },
    { onHand: 7, safetyStock: 4, available: 3, openingDate: "2026-11-20" },
  );
  assert.equal(balanceOf([opening], [dr({ status: "draft" })]).get(stockKey("W1", "P1"))?.onHand, 10);
  assert.equal(balanceOf([opening], [dr({ date: "2026-11-19" })]).get(stockKey("W1", "P1"))?.onHand, 10);
  assert.equal(balanceOf([opening], [dr({ date: "11/21/2026", status: "Completed " })]).get(stockKey("W1", "P1"))?.onHand, 7);
  const voided = movement({ movementId: "MOV-2", qty: 5, status: "void" });
  assert.equal(balanceOf([opening, voided], []).get(stockKey("W1", "P1"))?.onHand, 10);
  const out = movement({ movementId: "MOV-3", qty: -2, type: "TRANSFER_OUT", sourceType: "TRANSFER", sourceId: "TRF-1" });
  assert.equal(balanceOf([opening, out], []).get(stockKey("W1", "P1"))?.onHand, 8);
  const beforeOpening = movement({ movementId: "MOV-4", qty: 5, date: "2026-11-01" });
  assert.equal(balanceOf([opening, beforeOpening], []).get(stockKey("W1", "P1"))?.onHand, 10);
}

// computeBalances excludes the edited source
{
  assert.equal(balanceOf([opening], [dr({ quantity: 10 })]).get(stockKey("W1", "P1"))?.onHand, 0);
  assert.equal(balanceOf([opening], [dr({ quantity: 10 })], { drNumber: 1 }).get(stockKey("W1", "P1"))?.onHand, 10);
  const out = movement({ movementId: "MOV-3", qty: -6, type: "TRANSFER_OUT", sourceType: "TRANSFER", sourceId: "TRF-1" });
  assert.equal(balanceOf([opening, out], [], { transferId: "TRF-1" }).get(stockKey("W1", "P1"))?.onHand, 10);
}

// computeBalances ignores untracked and warehouse-less lines
{
  const map = balanceOf([opening], [
    dr({ productId: "P3", quantity: 2 }),
    dr({ warehouseId: "", quantity: 2 }),
    dr({ productId: "", quantity: 2 }),
  ]);
  assert.equal(map.get(stockKey("W1", "P1"))?.onHand, 10);
  assert.equal(map.has(stockKey("W1", "P3")), false);
  assert.equal(map.size, 1);
}

// checkLines classification
{
  const balances = balanceOf([opening], []);
  const ok = checkLines(balances, "W1", [{ productId: "P1", quantity: 6 }], tracked);
  assert.equal(ok.result, "ok");
  const approve = checkLines(balances, "W1", [{ productId: "P1", quantity: 8 }], tracked);
  assert.equal(approve.result, "needs_approval");
  assert.equal(approve.lines[0].safetyUsed, 2);
  const blocked = checkLines(balances, "W1", [{ productId: "P1", quantity: 11 }], tracked);
  assert.equal(blocked.result, "blocked");
  assert.equal(blocked.lines[0].shortfall, 1);
  const worst = checkLines(balances, "W1", [{ productId: "P1", quantity: 8 }, { productId: "P2", quantity: 1 }], tracked);
  assert.equal(worst.result, "blocked");
  const p2 = worst.lines.find((line) => line.productId === "P2");
  assert.equal(p2?.onHand, 0);
  const manual = checkLines(balances, "W1", [{ quantity: 99 }, { productId: "P3", quantity: 99 }], tracked);
  assert.equal(manual.result, "ok");
  assert.equal(manual.lines.length, 0);
}

// checkLines per warehouse part (a DR line split across warehouses)
{
  const w2Opening = movement({ movementId: "MOV-W2", warehouseId: "W2", type: "OPENING", qty: 3 });
  const balances = balanceOf([opening, w2Opening], []);
  assert.equal(checkLines(balances, "W1", [{ productId: "P1", quantity: 6 }], tracked).lines[0].warehouseId, "W1");
  const split = checkLines(balances, "", [{ warehouseId: "W1", productId: "P1", quantity: 2 }, { warehouseId: "W2", productId: "P1", quantity: 3 }], tracked);
  assert.equal(split.result, "ok");
  assert.equal(split.lines.length, 2);
  const short = checkLines(balances, "", [{ warehouseId: "W1", productId: "P1", quantity: 2 }, { warehouseId: "W2", productId: "P1", quantity: 4 }], tracked);
  assert.equal(short.result, "blocked");
  const w2 = short.lines.find((line) => line.warehouseId === "W2");
  assert.equal(w2?.result, "blocked");
  assert.equal(w2?.shortfall, 1);
  assert.equal(short.lines.find((line) => line.warehouseId === "W1")?.result, "ok");
  assert.equal(checkLines(balances, "", [{ warehouseId: "W1", productId: "P1", quantity: 8 }, { warehouseId: "W2", productId: "P1", quantity: 1 }], tracked).result, "needs_approval");
  const same = checkLines(balances, "", [{ warehouseId: "W1", productId: "P1", quantity: 2 }, { warehouseId: "W1", productId: "P1", quantity: 3 }], tracked);
  assert.equal(same.lines.length, 1);
  assert.equal(same.lines[0].requested, 5);
  assert.equal(checkLines(balances, "", [{ productId: "P1", quantity: 2 }], tracked).lines.length, 0);
}

// drCheckLines flattens a DR's lines into warehouse parts
{
  assert.deepEqual(
    drCheckLines([{ productId: "P1", quantity: 5, sources: [{ warehouseId: "W1", quantity: 2 }, { warehouseId: "W2", quantity: 3 }] }], "W1"),
    [{ warehouseId: "W1", productId: "P1", quantity: 2 }, { warehouseId: "W2", productId: "P1", quantity: 3 }],
  );
  assert.deepEqual(drCheckLines([{ productId: "P1", quantity: 5 }], "W1"), [{ warehouseId: "W1", productId: "P1", quantity: 5 }]);
}

// checkLines sums duplicate products
{
  const six = computeBalances({
    movements: [movement({ type: "OPENING", qty: 6 })],
    drLines: [],
    safety: [],
    trackedProductIds: tracked,
  });
  const result = checkLines(six, "W1", [{ productId: "P1", quantity: 3 }, { productId: "P1", quantity: 4 }], tracked);
  assert.equal(result.result, "blocked");
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].requested, 7);
}

// resolveDocumentStatus never lets a non-manager skip approval
{
  const balances = balanceOf([opening], []);
  const needs = checkLines(balances, "W1", [{ productId: "P1", quantity: 8 }], tracked);
  const ok = checkLines(balances, "W1", [{ productId: "P1", quantity: 2 }], tracked);
  const blocked = checkLines(balances, "W1", [{ productId: "P1", quantity: 20 }], tracked);
  assert.deepEqual(resolveDocumentStatus({ requested: "printed", check: needs, level: "operate" }), { status: "pending_approval", selfApproved: false });
  assert.deepEqual(resolveDocumentStatus({ requested: "printed", check: needs, level: "view" }), { status: "pending_approval", selfApproved: false });
  assert.deepEqual(resolveDocumentStatus({ requested: "printed", check: needs, level: "manage" }), { status: "printed", selfApproved: true });
  for (const level of ["view", "operate", "manage"] as const) {
    assert.ok("error" in resolveDocumentStatus({ requested: "printed", check: blocked, level }), level);
  }
  assert.deepEqual(resolveDocumentStatus({ requested: "draft", check: blocked, level: "operate" }), { status: "draft", selfApproved: false });
  assert.deepEqual(resolveDocumentStatus({ requested: "created", check: ok, level: "operate" }), { status: "created", selfApproved: false });
}

// accessLevelFor
assert.equal(accessLevelFor({ positionTitle: "Sales Manager", superAdmin: false }), "manage");
assert.equal(accessLevelFor({ positionTitle: "GM", superAdmin: false }), "manage");
assert.equal(accessLevelFor({ positionTitle: "Tech-Admin", superAdmin: false }), "operate");
assert.equal(accessLevelFor({ positionTitle: " staff ", superAdmin: false }), "operate");
assert.equal(accessLevelFor({ positionTitle: "Technician", superAdmin: false }), "view");
assert.equal(accessLevelFor({ positionTitle: "Supervisor", superAdmin: false }), "view");
assert.equal(accessLevelFor({ positionTitle: "", superAdmin: false }), "view");
assert.equal(accessLevelFor({ positionTitle: "Technician", superAdmin: true }), "manage");

// canPerform
assert.equal(canPerform("operate", "entry:ADJUSTMENT"), true, "Staff and Tech Admin may recount");
assert.equal(canPerform("view", "entry:ADJUSTMENT"), false);
assert.equal(canPerform("operate", "safety:set"), false);
assert.equal(canPerform("operate", "approval:decide"), false);
assert.equal(canPerform("operate", "entry:void"), false);
assert.equal(canPerform("operate", "transfer:create"), true);
assert.equal(canPerform("operate", "entry:OPENING"), true);
assert.equal(canPerform("manage", "approval:decide"), true);
for (const action of ["entry:OPENING", "entry:RECEIVED", "transfer:create", "transfer:cancel"] as const) {
  assert.equal(canPerform("view", action), false, action);
}

// dateBeforeOpening
{
  const balances = balanceOf([opening], []);
  assert.equal(dateBeforeOpening(balances, "W1", "P1", "2026-11-19"), true);
  assert.equal(dateBeforeOpening(balances, "W1", "P1", "11/19/2026"), true);
  assert.equal(dateBeforeOpening(balances, "W1", "P1", "2026-11-20"), false);
  assert.equal(dateBeforeOpening(balances, "W1", "P2", "2020-01-01"), false);
}

console.log("inventory domain tests passed.");

// Fail closed: a counted DR whose date cannot be read still reduces stock
{
  const b = balanceOf([opening], [dr({ date: "Nov 21, 2026", quantity: 4 })]).get(stockKey("W1", "P1"));
  assert.equal(b?.onHand, 6, "an unreadable DR date must count, not silently drop out of stock");
  const drafted = balanceOf([opening], [dr({ date: "Nov 21, 2026", status: "draft", quantity: 4 })]).get(stockKey("W1", "P1"));
  assert.equal(drafted?.onHand, 10, "a held DR with an unreadable date still does not count");
}
console.log("inventory fail-closed date tests passed.");

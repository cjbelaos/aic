// Stock on Hand pivot — focused tests.
//
// pivotStock turns warehouse×product rows into one row per product. Totals sum
// counted warehouses only; rows for warehouses outside the shown list are ignored.

import assert from "node:assert/strict";
import { pivotStock, warehouseSortValue, type StockRow } from "../../src/lib/inventory/pivot.ts";

function row(warehouseId: string, productId: string, onHand: number, available: number, counted = true): StockRow {
  return {
    warehouseId,
    warehouseName: warehouseId,
    productId,
    productCode: `C-${productId}`,
    productName: `Product ${productId}`,
    categoryName: "Consumables",
    openingDate: counted ? "2026-11-01" : null,
    onHand,
    safetyStock: 0,
    available,
  };
}

// groups by product, first-appearance order
const out = pivotStock([row("W1", "P1", 5, 5), row("W2", "P1", 3, 1), row("W1", "P2", 2, 2)], ["W1", "W2"]);
assert.deepEqual(out.map((p) => p.productId), ["P1", "P2"]);
assert.equal(out[0].productName, "Product P1");
assert.equal(out[0].cells.W2?.onHand, 3);
assert.equal(out[0].totalOnHand, 8);
assert.equal(out[0].totalAvailable, 6);

// missing pair: no row for P2 at W2
assert.equal(out[1].cells.W2, undefined);
assert.equal(out[1].totalOnHand, 2);

// uncounted excluded (onHand 0, available -4 from safety stock)
const u = pivotStock([row("W1", "P1", 5, 5), row("W2", "P1", 0, -4, false)], ["W1", "W2"]);
assert.equal(u[0].totalAvailable, 5);
assert.equal(u[0].totalOnHand, 5);
assert.ok(u[0].cells.W2, "uncounted cell is kept so it can be counted");

// negative totals are not clamped
const n = pivotStock([row("W1", "P1", -2, -3), row("W2", "P1", 1, 1)], ["W1", "W2"]);
assert.equal(n[0].totalOnHand, -1);
assert.equal(n[0].totalAvailable, -2);

// unknown warehouse is ignored
const x = pivotStock([row("W1", "P1", 5, 5), row("OLD", "P1", 9, 9)], ["W1"]);
assert.equal(x[0].cells.OLD, undefined);
assert.equal(x[0].totalOnHand, 5);

// sort value: undefined (not null) for uncounted or missing, so TanStack sortUndefined "last" applies
assert.equal(warehouseSortValue(u[0], "W1"), 5);
assert.equal(warehouseSortValue(u[0], "W2"), undefined);
assert.equal(warehouseSortValue(out[1], "W2"), undefined);

console.log("pivot tests passed.");

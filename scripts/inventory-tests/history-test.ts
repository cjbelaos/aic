// Movement history: one row's history, or every movement for the export.

import assert from "node:assert/strict";
import { buildHistoryRows, type DrStockLine, type StockMovement } from "../../src/lib/inventory/domain.ts";

const mv = (over: Partial<StockMovement>): StockMovement => ({
  movementId: "M1", date: "2026-11-19", warehouseId: "WH-1", productId: "P1", qty: 10, type: "OPENING",
  sourceType: "ENTRY", sourceId: "", referenceNo: "", note: "", status: "active", createdBy: "ana", createdAt: "",
  ...over,
});
const dr = (over: Partial<DrStockLine>): DrStockLine => ({
  drNumber: 100, date: "2026-11-20", status: "created", warehouseId: "WH-1", productId: "P1", quantity: 2, ...over,
});

const movements = [
  mv({}),
  mv({ movementId: "M2", warehouseId: "WH-2", date: "2026-11-21", type: "TRANSFER_IN", sourceType: "TRANSFER", sourceId: "T1", qty: 3 }),
  mv({ movementId: "M3", productId: "P2", status: "void", type: "RECEIVED" }),
];
const drLines = [
  dr({}),
  dr({ drNumber: -1, status: "pending_approval", date: "2026-11-22" }),
  dr({ drNumber: 101, status: "draft" }),
  dr({ drNumber: 102, status: "cancelled" }),
];
const transferNos = new Map([["T1", "ST-2026-0001"]]);

// One warehouse + product: only its rows, newest first; drafts and cancelled DRs left out
const one = buildHistoryRows({ movements, drLines, transferNos, warehouseId: "WH-1", productId: "P1" });
assert.deepEqual(one.map((r) => r.id), ["DR--1-P1", "DR-100-P1", "M1"]);
assert.equal(one[0].status, "pending_approval");
assert.equal(one[0].referenceNo, "Pending DR");
assert.equal(one[1].qty, -2, "a delivery removes stock");
assert.equal(one[1].referenceNo, "DR #100");

// No filters: every movement (voided ones included, marked void), with warehouse and product on each row
const all = buildHistoryRows({ movements, drLines, transferNos });
assert.deepEqual(all.map((r) => r.id), ["DR--1-P1", "M2", "DR-100-P1", "M1", "M3"]);
const transfer = all.find((r) => r.id === "M2");
assert.equal(transfer?.warehouseId, "WH-2");
assert.equal(transfer?.productId, "P1");
assert.equal(transfer?.source.label, "ST-2026-0001");
assert.equal(all.find((r) => r.id === "M3")?.status, "void");

// Warehouse only: every product at that warehouse
assert.deepEqual(buildHistoryRows({ movements, drLines, transferNos, warehouseId: "WH-1" }).map((r) => r.id), ["DR--1-P1", "DR-100-P1", "M1", "M3"]);

console.log("Inventory history tests passed.");

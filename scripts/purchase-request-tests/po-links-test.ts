import assert from "node:assert/strict";
import { buildLinkRows, derivePoPrNumbers } from "../../src/lib/purchaseRequests/domain.ts";
import type { PurchaseRequestItem } from "../../src/types/purchaseRequest.ts";

const prItem = (prItemId: string, prId: string) => ({ prItemId, prId } as PurchaseRequestItem);
const prItems = [prItem("PRI-000001", "PR-000001"), prItem("PRI-000002", "PR-000001"), prItem("PRI-000003", "PR-000002")];

const rows = buildLinkRows("PO-1", [
  { prLinks: [{ prItemId: "PRI-000001", quantity: 2 }] },
  {},
  { prLinks: [{ prItemId: "PRI-000002", quantity: 1 }, { prItemId: "PRI-000003", quantity: 4 }] },
], prItems, "u1", "t");
assert.deepEqual(rows, [
  { poNumber: "PO-1", poItemNo: 1, prId: "PR-000001", prItemId: "PRI-000001", quantity: 2, createdAt: "t", createdBy: "u1" },
  { poNumber: "PO-1", poItemNo: 3, prId: "PR-000001", prItemId: "PRI-000002", quantity: 1, createdAt: "t", createdBy: "u1" },
  { poNumber: "PO-1", poItemNo: 3, prId: "PR-000002", prItemId: "PRI-000003", quantity: 4, createdAt: "t", createdBy: "u1" },
]);
assert.deepEqual(buildLinkRows("PO-1", [{}, { prLinks: [] }], prItems, "u1", "t"), []);

// derived PR# for a PO: distinct PR numbers, sorted; empty when no links
const prNoById = new Map([["PR-000001", "AIC-PR-2026-0002"], ["PR-000002", "AIC-PR-2026-0001"]]);
const link = (poNumber: string, prId: string) => ({ linkId: "x", poNumber, poItemNo: 1, prId, prItemId: "i", quantity: 1, createdAt: "", createdBy: "" });
assert.equal(derivePoPrNumbers("PO-1", [link("PO-1", "PR-000001"), link("PO-1", "PR-000002"), link("PO-1", "PR-000001"), link("PO-2", "PR-000002")], prNoById), "AIC-PR-2026-0001, AIC-PR-2026-0002");
assert.equal(derivePoPrNumbers("PO-9", [link("PO-1", "PR-000001")], prNoById), "");

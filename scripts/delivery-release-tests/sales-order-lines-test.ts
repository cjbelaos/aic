// Sales-Order-linked Delivery Release lines — focused tests.
//
// A DR linked to a Sales Order delivers that order's product lines. When the
// order includes an active SERVICE line, parts used to perform the service may
// ride on the same DR without a Sales Order line (they never count as fulfilment).

import assert from "node:assert/strict";
import { salesOrderDeliveryLineError, type OrderLineForDelivery } from "../../src/lib/deliverySalesOrderLines.ts";

const product = (id: string, over: Partial<OrderLineForDelivery> = {}): OrderLineForDelivery => ({
  salesOrderItemId: id, lineType: "PRODUCT", lineStatus: "ACTIVE", productId: `P-${id}`,
  quantity: 5, fulfilledQty: 1, cancelledQty: 1, ...over,
});
const service = (id: string, lineStatus = "ACTIVE"): OrderLineForDelivery => ({
  salesOrderItemId: id, lineType: "SERVICE", lineStatus, productId: "", quantity: 1, fulfilledQty: 0, cancelledQty: 0,
});
const part = { productId: "PART-1", productCode: "TOP-STRAINER", quantity: 1 };

// ── Sales Order product lines (unchanged rules) ──
assert.equal(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 3 }], [product("a")]), null);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 4 }], [product("a")]) ?? "", /line 1 exceeds .*remaining quantity \(3\)/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 0 }], [product("a")]) ?? "", /exceeds/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "OTHER", quantity: 1 }], [product("a")]) ?? "", /line 1 does not match/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 1 }], [product("a", { lineStatus: "INACTIVE" })]) ?? "", /line 1 must reference an active product line/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "s", quantity: 1 }], [service("s")]) ?? "", /must reference an active product line/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "missing", quantity: 1 }], [product("a")]) ?? "", /must reference an active product line/);

// ── Parts without a Sales Order line ──
// Product-only order: still rejected, and the message says why.
assert.match(salesOrderDeliveryLineError([part], [product("a")]) ?? "", /line 1 must reference an active product line .*no active service line/);
// AIC-SO-2026-1470 shape: removed product line + two active service lines → parts allowed.
assert.equal(salesOrderDeliveryLineError(
  [part, { ...part, productCode: "RISER-TUBE" }],
  [product("old", { lineStatus: "INACTIVE" }), service("s1"), service("s2")],
), null);
// Only inactive service lines → not a service order any more.
assert.match(salesOrderDeliveryLineError([part], [service("s1", "INACTIVE")]) ?? "", /no active service line/);
// Mixed DR on a service order: linked product line still fully validated, parts allowed.
assert.equal(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 2 }, part], [product("a"), service("s1")]), null);
assert.match(salesOrderDeliveryLineError([part, { salesOrderItemId: "a", productId: "P-a", quantity: 9 }], [product("a"), service("s1")]) ?? "", /line 2 exceeds/);

console.log("sales-order-lines tests passed.");

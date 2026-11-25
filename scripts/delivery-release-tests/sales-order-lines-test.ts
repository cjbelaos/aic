// Sales-Order-linked Delivery Release lines — focused tests.
//
// A DR linked to a Sales Order delivers that order's product lines. When the
// order includes an active SERVICE line, parts used to perform the service may
// ride on the same DR without a Sales Order line (they never count as fulfilment).

import assert from "node:assert/strict";
import { linkOrderProductLines, postedDeliveryLines, postedLineEditError, salesOrderDeliveryLineError, withoutOwnFulfillment, type DeliveryLineForOrder, type FulfillmentForDelivery, type OrderLineForDelivery } from "../../src/lib/deliverySalesOrderLines.ts";

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
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 4 }], [product("a")]) ?? "", /more than what's left[\s\S]*Line 1: .*only 3 left/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 0 }], [product("a")]) ?? "", /more than what's left/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "OTHER", quantity: 1 }], [product("a")]) ?? "", /don't match[\s\S]*Line 1/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 1 }], [product("a", { lineStatus: "INACTIVE" })]) ?? "", /Line 1: .*no longer an active line/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "s", quantity: 1 }], [service("s")]) ?? "", /not on the selected Sales Order/);
assert.match(salesOrderDeliveryLineError([{ salesOrderItemId: "missing", quantity: 1 }], [product("a")]) ?? "", /not on the selected Sales Order/);

// ── Parts without a Sales Order line ──
// Product-only order: still rejected, and the message says why.
assert.match(salesOrderDeliveryLineError([part], [product("a")]) ?? "", /Line 1: TOP-STRAINER[\s\S]*no service line/);
// AIC-SO-2026-1460 shape: every failing line is listed by name, with the order number;
// the valid linked line is not.
{
  const message = salesOrderDeliveryLineError(
    [
      { productId: "PROD-000071", productCode: "SU-BLOO20-0071", description: "BLOODLINES - SURGITECH", quantity: 6 },
      { productId: "PROD-000537", productCode: "SE-PERI24-0540", description: "CHEMICAL FILLING SYSTEM CONVERSION\n-INSTALLATION OF NEW PERISTALTIC PUMP", quantity: 1 },
      { salesOrderItemId: "a", productId: "P-a", description: "DIALYZER COUPLING", quantity: 3 },
      { productId: "PROD-000045", description: "SEMI AUTO REPROCESSING SOLENOID VALVE 220V", quantity: 6 },
    ],
    [product("a")],
    "AIC-SO-2026-1460",
  ) ?? "";
  assert.match(message, /not on Sales Order AIC-SO-2026-1460/);
  assert.match(message, /Line 1: BLOODLINES - SURGITECH\n/);
  assert.match(message, /Line 2: CHEMICAL FILLING SYSTEM CONVERSION\n/);
  assert.match(message, /Line 4: SEMI AUTO REPROCESSING SOLENOID VALVE 220V\n/);
  assert.doesNotMatch(message, /Line 3/);
  assert.match(message, /Remove these lines, or add them to the Sales Order first\./);
}
// AIC-SO-2026-1470 shape: removed product line + two active service lines → parts allowed.
assert.equal(salesOrderDeliveryLineError(
  [part, { ...part, productCode: "RISER-TUBE" }],
  [product("old", { lineStatus: "INACTIVE" }), service("s1"), service("s2")],
), null);
// Only inactive service lines → not a service order any more.
assert.match(salesOrderDeliveryLineError([part], [service("s1", "INACTIVE")]) ?? "", /no service line/);
// Mixed DR on a service order: linked product line still fully validated, parts allowed.
assert.equal(salesOrderDeliveryLineError([{ salesOrderItemId: "a", productId: "P-a", quantity: 2 }, part], [product("a"), service("s1")]), null);
assert.match(salesOrderDeliveryLineError([part, { salesOrderItemId: "a", productId: "P-a", quantity: 9 }], [product("a"), service("s1")]) ?? "", /Line 2: .*only 3 left/);

// ── Hand-entered lines for an ordered product are linked (DR #4098 shape) ──
{
  const order = [product("a"), service("s1")];
  const linked = linkOrderProductLines<DeliveryLineForOrder>([part, { productId: "P-a", quantity: 5 }, { salesOrderItemId: "a", productId: "P-a", quantity: 1 }], order);
  assert.equal(linked[0].salesOrderItemId, undefined); // service part stays a part
  assert.equal(linked[1].salesOrderItemId, "a"); // ordered product is linked
  assert.equal(linked[2].salesOrderItemId, "a"); // already linked: unchanged
  // Inactive order lines are never linked.
  assert.equal(linkOrderProductLines<DeliveryLineForOrder>([{ productId: "P-a", quantity: 1 }], [product("a", { lineStatus: "INACTIVE" })])[0].salesOrderItemId, undefined);
  // Once linked, the remaining-quantity rule applies (5 ordered, 2 already delivered or cancelled).
  assert.match(salesOrderDeliveryLineError(linkOrderProductLines<DeliveryLineForOrder>([{ productId: "P-a", quantity: 5 }], order), order) ?? "", /only 3 left/);
}

// ── Editing a DR that already counted toward the order ──
{
  const fulfil = (id: string, line: string, qty: number, over: Partial<FulfillmentForDelivery> = {}): FulfillmentForDelivery => ({
    fulfillmentId: id, salesOrderItemId: "a", fulfillmentType: "DELIVERY", sourceDocumentType: "DELIVERY_RECEIPT",
    sourceDocumentId: "4098", sourceLineId: line, quantity: qty, reversesFulfillmentId: "", status: "POSTED", ...over,
  });
  const ledger = [
    fulfil("f1", "dr-line-1", 2),
    fulfil("f2", "dr-line-2", 1),
    fulfil("r2", "dr-line-2", 1, { fulfillmentType: "REVERSAL", reversesFulfillmentId: "f2" }), // fully reversed
    fulfil("f3", "other-line", 9, { sourceDocumentId: "4000" }), // another DR
  ];
  const posted = postedDeliveryLines(ledger, 4098);
  assert.deepEqual([...posted.entries()], [["dr-line-1", { salesOrderItemId: "a", quantity: 2 }]]);

  // 5 ordered, 1 cancelled, 3 fulfilled of which 2 by this DR.
  const order = [product("a", { fulfilledQty: 3 })];
  assert.equal(withoutOwnFulfillment(order, posted)[0].fulfilledQty, 1);

  const stored = [{ deliveryReceiptItemId: "dr-line-1", salesOrderItemId: "a", productId: "P-a", description: "DIALYZER COUPLING", quantity: 2 }];
  // Unchanged line: allowed, and still fits once its own quantity is given back.
  assert.equal(postedLineEditError(stored, stored, posted, "SO-1"), null);
  assert.equal(salesOrderDeliveryLineError(stored, withoutOwnFulfillment(order, posted)), null);
  // Without giving it back, the same unchanged line would wrongly look over the remaining quantity.
  assert.match(salesOrderDeliveryLineError([{ ...stored[0], quantity: 2 }], order) ?? "", /only 1 left/);
  // Changed quantity, unlinked, or removed: refused, by name.
  assert.match(postedLineEditError([{ ...stored[0], quantity: 3 }], stored, posted, "SO-1") ?? "", /Line 1: DIALYZER COUPLING \(changed; 2 already delivered\)/);
  assert.match(postedLineEditError([{ ...stored[0], salesOrderItemId: undefined }], stored, posted, "SO-1") ?? "", /changed/);
  assert.match(postedLineEditError([], stored, posted, "SO-1") ?? "", /Line 1: DIALYZER COUPLING \(removed; 2 already delivered\)/);
  // Lines with nothing posted can be edited freely.
  assert.equal(postedLineEditError([], [{ deliveryReceiptItemId: "dr-line-2", quantity: 1 }], posted, "SO-1"), null);
}

console.log("sales-order-lines tests passed.");

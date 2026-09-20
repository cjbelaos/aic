import assert from "node:assert/strict";
import {
  applyCancellationToItem,
  applyReversalToItem,
  canTransition,
  collectConfirmationIssues,
  conversionPlanFromQuotation,
  deriveFulfillmentStatus,
  deriveOrderCategory,
  formatSalesOrderNo,
  isValidSalesOrderNo,
  nextSalesOrderNo,
  postFulfillment,
  recalculateItemMoney,
  recalculateOrderTotals,
  remainingDemand,
} from "../../src/lib/salesOrders/domain.ts";
import type { SalesOrder, SalesOrderItem } from "../../src/types/salesOrder.ts";

assert.equal(formatSalesOrderNo("2026", 1), "AIC-SO-2026-0001");
assert.equal(nextSalesOrderNo({ businessYear: "2026", lastNumber: 1297 }), "AIC-SO-2026-1298");
assert.equal(nextSalesOrderNo({ businessYear: "2027", lastNumber: 0 }), "AIC-SO-2027-0001");
assert.equal(isValidSalesOrderNo("AIC-SO-2026-0001"), true);
assert.equal(isValidSalesOrderNo("AIC-SO-2026-0000"), false);
assert.equal(isValidSalesOrderNo("1297"), false);

assert.equal(canTransition("DRAFT", "CONFIRMED"), true);
assert.equal(canTransition("CONFIRMED", "ON_HOLD"), true);
assert.equal(canTransition("ON_HOLD", "CONFIRMED"), true);
assert.equal(canTransition("DRAFT", "CLOSED"), false);
assert.equal(canTransition("CLOSED", "CONFIRMED"), false);
function makeItem(overrides: Partial<SalesOrderItem> = {}): SalesOrderItem {
  return {
    salesOrderItemId: "00000000-0000-4000-8000-000000000001",
    salesOrderId: "00000000-0000-4000-8000-000000000000",
    lineNo: 1,
    orderCategory: "Parts",
    lineType: "PRODUCT",
    productId: "PRD-1",
    productCodeSnapshot: "SKU-1",
    productNameSnapshot: "Part A",
    customerProductNameSnapshot: "",
    description: "Part A",
    unitId: "UN-1",
    unitSnapshot: "pc",
    quantity: 10,
    unitPrice: 100,
    priceSource: "DEFAULT_PRICE",
    customerProductPriceId: "",
    quotationLineReference: "",
    discountAmount: 0,
    taxMode: "VAT_INCLUSIVE",
    taxRate: 0.12,
    subtotalExTax: 0,
    taxAmount: 0,
    lineTotal: 0,
    fulfilledQty: 0,
    cancelledQty: 0,
    lineStatus: "ACTIVE",
    priceOverrideReason: "",
    createdAt: "2026-09-19T00:00:00.000Z",
    createdBy: "user",
    updatedAt: "",
    updatedBy: "",
    ...overrides,
  };
}

assert.equal(deriveOrderCategory([makeItem(), makeItem({ orderCategory: "Parts" })]), "Parts");
assert.equal(deriveOrderCategory([makeItem({ orderCategory: "Parts" }), makeItem({ orderCategory: "Services/ Repair" })]), "Mixed");
assert.equal(deriveOrderCategory([makeItem({ lineStatus: "INACTIVE" })]), "");

const item10 = makeItem({ quantity: 10 });
assert.equal(deriveFulfillmentStatus([item10]), "UNFULFILLED");
assert.equal(remainingDemand(item10), 10);

const partial = postFulfillment(item10, 4);
assert.equal(partial.fulfilledQty, 4);
assert.equal(remainingDemand(partial), 6);
assert.equal(deriveFulfillmentStatus([partial]), "PARTIAL");
assert.throws(() => postFulfillment(partial, 7), /exceeds the remaining demand/);
assert.throws(() => postFulfillment(item10, 0), /greater than zero/);

const delivered = postFulfillment(item10, 10);
assert.equal(deriveFulfillmentStatus([delivered]), "FULFILLED");
const afterReversal = applyReversalToItem(delivered, 3);
assert.equal(afterReversal.fulfilledQty, 7);
assert.equal(deriveFulfillmentStatus([afterReversal]), "PARTIAL");
assert.throws(() => applyReversalToItem(afterReversal, 8), /exceeds the fulfilled quantity/);

const cancelled = applyCancellationToItem(partial, 2);
assert.equal(cancelled.cancelledQty, 2);
assert.equal(remainingDemand(cancelled), 4);
assert.throws(() => applyCancellationToItem(cancelled, 5), /exceeds the outstanding quantity/);

assert.equal(deriveFulfillmentStatus([postFulfillment(applyCancellationToItem(item10, 4), 6)]), "FULFILLED");

const priced = { ...item10, ...recalculateItemMoney(item10) };
const second = makeItem({ quantity: 5, unitPrice: 80 });
const priced2 = { ...second, ...recalculateItemMoney(second) };
const orderTotals = recalculateOrderTotals([priced, priced2]);
assert.equal(priced.lineTotal, 1000);
assert.equal(orderTotals.grandTotal, 1400);
const baseOrder: Pick<SalesOrder, "customerId" | "receivedDate" | "currency" | "orderStatus" | "assignedToUserId"> = {
  customerId: "",
  receivedDate: "2026-09-19",
  currency: "PHP",
  orderStatus: "DRAFT",
  assignedToUserId: "",
};
const issues = collectConfirmationIssues({ order: baseOrder, items: [makeItem()], assignmentOptional: false });
assert.ok(issues.some((issue) => issue.includes("customer")), "missing customer must block confirmation");
const blockedProductLine = makeItem({ lineType: "PRODUCT", productId: "" });
const readyOrder = { ...baseOrder, customerId: "COMP-1", assignedToUserId: "U-1" };
assert.equal(collectConfirmationIssues({ order: readyOrder, items: [blockedProductLine], assignmentOptional: false }).length >= 1, true);
assert.equal(collectConfirmationIssues({ order: readyOrder, items: [makeItem()], assignmentOptional: false }).length, 0);

const plan = conversionPlanFromQuotation({
  quotationNo: "QT-001",
  defaultTaxMode: "VAT_INCLUSIVE",
  defaultTaxRate: 0.12,
  shippingFee: 2000,
  items: [{ productId: "PRD-9", productCodeSnapshot: "SKU-9", description: "Widget", quantity: 4, unit: "pc", unitPrice: 1750 }],
});
assert.equal(plan.lines[0].priceSource, "QUOTATION");
assert.equal(plan.lines[0].lineType, "PRODUCT");
assert.equal(plan.lines[0].quantity, 4);
assert.equal(plan.lines[0].unitPrice, 1750);
assert.equal(plan.lines.length, 2);
assert.equal(plan.lines[1].description, "Shipping Fee");
assert.equal(plan.lines[1].unitPrice, 2000);
const convertedTotals = recalculateOrderTotals(plan.lines.map((line) => makeItem({
  quantity: line.quantity,
  unitPrice: line.unitPrice,
  taxMode: line.taxMode,
  taxRate: line.taxRate,
  subtotalExTax: recalculateItemMoney(line).subtotalExTax,
  taxAmount: recalculateItemMoney(line).taxAmount,
  lineTotal: recalculateItemMoney(line).lineTotal,
})));
assert.equal(convertedTotals.grandTotal, 9000);
assert.equal(convertedTotals.taxTotal, 964.29);
assert.equal(convertedTotals.subtotalExTax, 8035.71);

console.log("domain-test passed: numbering, transitions, category/fulfillment projections, money, confirmation readiness, quotation conversion.");

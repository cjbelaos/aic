// Quotation → Sales Order conversion tests: mixed product/service lines, the
// historical per-line behaviour and the single-total ("one price for the job")
// representation. Run through `npm run test:sales-orders`.

import assert from "node:assert/strict";
import {
  collectConfirmationIssues,
  conversionPlanFromQuotation,
  convertedLineCategory,
  isNotPricedLine,
  priceSourceLabel,
  recalculateItemMoneyForLine,
  recalculateOrderTotals,
} from "../../src/lib/salesOrders/domain.ts";
import { PRICE_SOURCE_NOT_PRICED } from "../../src/types/salesOrder.ts";

const quotationItems = [
  { productId: "P-1", productCodeSnapshot: "SKU-1", description: "Filter cartridge", quantity: 2, unit: "pc", unitPrice: 500 },
  { description: "Repair labour", quantity: 1, unit: "lot", unitPrice: 1500 },
];

// ── per-line quotations keep the historical conversion byte-for-byte ────────
const perLine = conversionPlanFromQuotation({
  quotationNo: "Q-1",
  items: quotationItems,
  shippingFee: 100,
  defaultTaxMode: "VAT_INCLUSIVE",
  defaultTaxRate: 0.12,
});
assert.equal(perLine.pricingMode, "PER_LINE");
assert.equal(perLine.combinedTotal, 0);
assert.equal(perLine.lines.length, 3);
assert.equal(perLine.lines[0].lineType, "PRODUCT");
assert.equal(perLine.lines[0].priceSource, "QUOTATION");
assert.equal(perLine.lines[0].unitPrice, 500);
assert.equal(perLine.lines[0].unitId, "pc");
assert.equal(perLine.lines[1].lineType, "SERVICE");
assert.equal(perLine.lines[1].unitPrice, 1500);
assert.equal(perLine.lines[2].description, "Shipping Fee");
assert.equal(perLine.lines[2].lineType, "SERVICE");
assert.equal(convertedLineCategory({ lineType: "SERVICE" }), "Services/ Repair");
assert.equal(convertedLineCategory({ lineType: "PRODUCT" }), "Parts");

// ── single-total quotations: every description kept, one combined charge ────
const single = conversionPlanFromQuotation({
  quotationNo: "Q-2",
  items: quotationItems,
  shippingFee: 100,
  defaultTaxMode: "VAT_INCLUSIVE",
  defaultTaxRate: 0.12,
  pricingMode: "SINGLE_TOTAL",
  singleTotalPrice: 5000,
  discount: 200,
});
assert.equal(single.pricingMode, "SINGLE_TOTAL");
assert.equal(single.combinedTotal, 5000);
assert.equal(single.combinedDiscount, 200);
// described order is preserved, then the combined charge, then shipping
assert.deepEqual(single.lines.map((line) => line.description), [
  "Filter cartridge",
  "Repair labour",
  "Combined total as quoted",
  "Shipping Fee",
]);
assert.deepEqual(single.lines.map((line) => line.lineType), ["PRODUCT", "SERVICE", "SERVICE", "SERVICE"]);
// descriptive lines carry no invented price
assert.equal(single.lines[0].unitPrice, null);
assert.equal(single.lines[0].priceSource, PRICE_SOURCE_NOT_PRICED);
assert.equal(single.lines[0].quantity, 2);
assert.equal(single.lines[0].discountAmount, 0);
assert.equal(single.lines[1].unitPrice, null);
assert.equal(single.lines[1].priceSource, PRICE_SOURCE_NOT_PRICED);
// the combined charge is the only priced line of the job
assert.equal(single.lines[2].unitPrice, 5000);
assert.equal(single.lines[2].priceSource, "QUOTATION");
assert.equal(single.lines[2].discountAmount, 200);
assert.equal(single.lines[2].quantity, 1);

// A 0/blank quoted quantity would fail line validation; it is carried as unknown.
const blankQuantity = conversionPlanFromQuotation({
  quotationNo: "Q-3",
  items: [{ description: "Inspection", quantity: 0, unit: "", unitPrice: 0 }],
  defaultTaxMode: "VAT_INCLUSIVE",
  defaultTaxRate: 0.12,
  pricingMode: "SINGLE_TOTAL",
  singleTotalPrice: 1200,
});
assert.equal(blankQuantity.lines[0].quantity, null);

// ── money + totals: non-priced lines contribute nothing ────────────────────
assert.equal(isNotPricedLine({ priceSource: PRICE_SOURCE_NOT_PRICED }), true);
assert.equal(isNotPricedLine({ priceSource: "QUOTATION" }), false);
assert.equal(priceSourceLabel(PRICE_SOURCE_NOT_PRICED), "Included in combined total");
assert.equal(recalculateItemMoneyForLine({ quantity: 2, unitPrice: null, discountAmount: 0, taxMode: "VAT_INCLUSIVE", taxRate: 0.12, priceSource: PRICE_SOURCE_NOT_PRICED }).lineTotal, 0);
assert.equal(recalculateItemMoneyForLine({ quantity: null, unitPrice: null, discountAmount: 0, taxMode: "VAT_INCLUSIVE", taxRate: 0.12, priceSource: PRICE_SOURCE_NOT_PRICED }).taxAmount, 0);

const converted = single.lines.map((line) => {
  const money = recalculateItemMoneyForLine({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountAmount: line.discountAmount,
    taxMode: line.taxMode,
    taxRate: line.taxRate,
    priceSource: line.priceSource,
  });
  return { ...money, discountAmount: line.discountAmount, lineStatus: "ACTIVE" as const };
});
const totals = recalculateOrderTotals(converted);
// Quotation total = max(5000 - 200, 0) + 100 = 4900, and the order matches it.
assert.equal(totals.grandTotal, 4900);

// ── confirmation readiness ─────────────────────────────────────────────────
const order = { customerId: "C-1", receivedDate: "2026-09-25", currency: "PHP" as const, orderStatus: "DRAFT" as const, assignedToUserId: "U-1" };
const notPricedLine = { lineStatus: "ACTIVE" as const, lineType: "SERVICE" as const, productId: "", description: "Repair labour", unitId: "lot", quantity: 1, unitPrice: null, priceSource: PRICE_SOURCE_NOT_PRICED };
const pricedLine = { lineStatus: "ACTIVE" as const, lineType: "SERVICE" as const, productId: "", description: "Combined total as quoted", unitId: "LOT", quantity: 1, unitPrice: 5000, priceSource: "QUOTATION" };
assert.deepEqual(collectConfirmationIssues({ order, items: [notPricedLine, pricedLine], assignmentOptional: false }), []);
// A normal line with no price is still rejected.
assert.equal(collectConfirmationIssues({ order, items: [{ ...pricedLine, priceSource: "MANUAL", unitPrice: null }], assignmentOptional: false }).length, 1);
// A product line still needs its product reference.
assert.equal(collectConfirmationIssues({ order, items: [{ ...pricedLine, lineType: "PRODUCT" as const, productId: "" }], assignmentOptional: false }).length, 1);

console.log("Quotation conversion tests passed.");

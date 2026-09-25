// Focused tests for the quotation pricing modes (per-line vs one total price).
// Run through `npm run test:quotations`.

import assert from "node:assert/strict";
import {
  DEFAULT_QUOTATION_PRICING_MODE,
  asMoney,
  isSingleTotalPricing,
  normalizeQuotationPricingMode,
  planPricingModeSwitch,
  quotationLineKind,
  quotationTotals,
  singleTotalPriceFromRecord,
} from "../../src/lib/quotationPricing.ts";

// ── mode normalisation: legacy/blank records stay on per-line pricing ────────
assert.equal(DEFAULT_QUOTATION_PRICING_MODE, "PER_LINE");
assert.equal(normalizeQuotationPricingMode(undefined), "PER_LINE");
assert.equal(normalizeQuotationPricingMode(null), "PER_LINE");
assert.equal(normalizeQuotationPricingMode(""), "PER_LINE");
assert.equal(normalizeQuotationPricingMode("per_line"), "PER_LINE");
assert.equal(normalizeQuotationPricingMode("SINGLE_TOTAL"), "SINGLE_TOTAL");
assert.equal(normalizeQuotationPricingMode(" single_total "), "SINGLE_TOTAL");
assert.equal(isSingleTotalPricing("SINGLE_TOTAL"), true);
assert.equal(isSingleTotalPricing("PER_LINE"), false);

// ── line kind: a product reference makes it a product, otherwise a service ───
assert.equal(quotationLineKind({ productId: "P-1" }), "PRODUCT");
assert.equal(quotationLineKind({ productId: "" }), "SERVICE");
assert.equal(quotationLineKind({}), "SERVICE");

// ── per-line pricing keeps the historical totals exactly ────────────────────
const lines = [
  { quantity: 2, unitPrice: 1000 },
  { quantity: 1, unitPrice: 500 },
];
const perLine = quotationTotals("PER_LINE", { lineItems: lines, discount: 100, shippingFee: 50 });
assert.equal(perLine.subtotal, 2500);
assert.equal(perLine.grandTotal, 2450);
assert.equal(perLine.vat, 2450 * (12 / 112));
assert.equal(perLine.vatableAmount, 2450 - 2450 * (12 / 112));
const legacy = quotationTotals(undefined, { lineItems: lines });
assert.equal(legacy.subtotal, 2500);
assert.equal(legacy.grandTotal, 2500);
assert.equal(legacy.vatableAmount, 2500 - 2500 * (12 / 112));

// ── single total price: the combined price is the only basis ────────────────
const single = quotationTotals("SINGLE_TOTAL", { lineItems: lines, singleTotalPrice: 8000 });
assert.equal(single.subtotal, 8000);
assert.equal(single.grandTotal, 8000);
assert.equal(single.vat, 8000 * (12 / 112));
// per-line prices are still reported for information only — never divided out
assert.equal(single.lineSubTotal, 2500);
assert.equal(single.priceBasis, 8000);

// Discount and shipping behave exactly as in per-line mode; totals never go negative.
const discounted = quotationTotals("SINGLE_TOTAL", { lineItems: lines, singleTotalPrice: 8000, discount: 500, shippingFee: 200 });
assert.equal(discounted.grandTotal, 7700);
assert.equal(quotationTotals("SINGLE_TOTAL", { lineItems: lines, singleTotalPrice: 100, discount: 500 }).grandTotal, 0);

// ── stored records ─────────────────────────────────────────────────────────
assert.equal(singleTotalPriceFromRecord({ pricingMode: "PER_LINE", singleTotalPrice: 9000, amount: 2500 }), 0);
assert.equal(singleTotalPriceFromRecord({ pricingMode: "SINGLE_TOTAL", singleTotalPrice: 8000, amount: 7700, discount: 500, shippingFee: 200 }), 8000);
// A single-total row saved before the price column existed derives it from the stored total.
assert.equal(singleTotalPriceFromRecord({ pricingMode: "SINGLE_TOTAL", amount: 7700, discount: 500, shippingFee: 200 }), 8000);
assert.equal(singleTotalPriceFromRecord({ pricingMode: "single_total", amount: 0 }), 0);
assert.equal(asMoney("not-a-number"), 0);
assert.equal(asMoney(-5), 0);

// ── mode switching: descriptions and pricing are never silently lost ────────
const toSingle = planPricingModeSwitch({ from: "PER_LINE", to: "SINGLE_TOTAL", lineItems: lines, singleTotalPrice: 0 });
assert.equal(toSingle.mode, "SINGLE_TOTAL");
assert.equal(toSingle.singleTotalPrice, 2500);
assert.equal(toSingle.seededFromLines, true);
assert.ok(toSingle.note.length > 0);

const keepEntered = planPricingModeSwitch({ from: "PER_LINE", to: "SINGLE_TOTAL", lineItems: lines, singleTotalPrice: 9000 });
assert.equal(keepEntered.singleTotalPrice, 9000);
assert.equal(keepEntered.seededFromLines, false);

const back = planPricingModeSwitch({ from: "SINGLE_TOTAL", to: "PER_LINE", lineItems: lines, singleTotalPrice: 9000 });
assert.equal(back.mode, "PER_LINE");
assert.equal(back.singleTotalPrice, 9000);
assert.equal(back.seededFromLines, false);

const unchanged = planPricingModeSwitch({ from: "PER_LINE", to: "PER_LINE", lineItems: lines, singleTotalPrice: 400 });
assert.equal(unchanged.singleTotalPrice, 400);
assert.equal(unchanged.note, "");

console.log("Quotation pricing tests passed.");

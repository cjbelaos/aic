import assert from "node:assert/strict";
import { computeLineMoney, fromCents, roundMoney, sumOrderTotals, toCents } from "../../src/lib/salesOrders/money.ts";
import type { TaxMode } from "../../src/types/salesOrder.ts";

// Fixed-point core: cents are lossless integers.
assert.equal(toCents(10.1), 1010);
assert.equal(fromCents(1010), 10.1);
assert.equal(toCents(0.1 + 0.2), 30);
assert.equal(roundMoney(0.1 + 0.2), 0.3);
assert.equal(roundMoney(10.005), 10.01);
assert.equal(roundMoney(10.004), 10.0);
assert.throws(() => toCents(null), /blank values stay unknown/);

// Inclusive VAT: 2 x 1_000 with 12% inclusive → payable 2000, VAT 214.29, base 1785.71.
const line = computeLineMoney({ quantity: 2, unitPrice: 1000, discountAmount: 0, taxMode: "VAT_INCLUSIVE", taxRate: 0.12 });
assert.equal(line.baseAmount, 1785.71);
assert.equal(line.taxAmount, 214.29);
assert.equal(line.lineTotal, 2000.0);

// Exclusive VAT: same values → tax is 12% of the base.
const excl = computeLineMoney({ quantity: 2, unitPrice: 1000, discountAmount: 0, taxMode: "VAT_EXCLUSIVE", taxRate: 0.12 });
assert.equal(excl.baseAmount, 2000.0);
assert.equal(excl.taxAmount, 240.0);
assert.equal(excl.lineTotal, 2240.0);

// Exempt and zero-rated carry no tax.
for (const mode of ["VAT_EXEMPT", "ZERO_RATED"] as TaxMode[]) {
  const exempt = computeLineMoney({ quantity: 1, unitPrice: 99.99, discountAmount: 0, taxMode: mode, taxRate: 0.12 });
  assert.equal(exempt.taxAmount, 0);
  assert.equal(exempt.lineTotal, exempt.baseAmount);
}

// Fixed-amount discount: payable 1000 - 100 = 900; inclusive VAT on 900.
const discounted = computeLineMoney({ quantity: 1, unitPrice: 1000, discountAmount: 100, taxMode: "VAT_INCLUSIVE", taxRate: 0.12 });
assert.equal(discounted.baseAmount, 803.57);
assert.equal(discounted.taxAmount, 96.43);
assert.equal(discounted.lineTotal, 900);

// A discount larger than the line is a domain error.
assert.throws(() => computeLineMoney({ quantity: 1, unitPrice: 10, discountAmount: 20, taxMode: "VAT_INCLUSIVE", taxRate: 0.12 }), /discount cannot exceed/);

// Order totals are the sum of rounded line amounts.
const totals = sumOrderTotals([
  { baseAmount: 1785.71, discountAmount: 0, taxAmount: 214.29, lineTotal: 2000 },
  { baseAmount: 99.99, discountAmount: 0, taxAmount: 0, lineTotal: 99.99 },
]);
assert.deepEqual(totals, { subtotalExTax: 1885.7, discountTotal: 0, taxTotal: 214.29, grandTotal: 2099.99 });

console.log("money-test passed: integer-cent arithmetic, inclusive/exclusive/exempt rounding, discounts, order totals.");
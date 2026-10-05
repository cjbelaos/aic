import assert from "node:assert/strict";
import { allocateDiscount, defaultDiscount, discountAmount, validateDiscount } from "../../src/lib/discounts.ts";
import { quotationTotals } from "../../src/lib/quotationPricing.ts";
import { quotationRowValues, parseQuotationRowValues } from "../../src/lib/quotationRow.ts";
import { applyOrderDiscounts } from "../../src/lib/salesOrders/discounts.ts";
import { allocateInvoiceDiscounts, hydrateInvoiceDiscount, invoiceTotals, resolveInvoiceDiscount } from "../../src/lib/serviceInvoiceDiscounts.ts";
import type { SalesOrder, SalesOrderItem } from "../../src/types/salesOrder.ts";

const fixed = defaultDiscount(5000);
const totals = quotationTotals("PER_LINE", { lineItems: [{ quantity: 3, unitPrice: 100000 / 3 }], discountSettings: fixed });
assert.equal(totals.grandTotal, 95000);
assert.ok(Math.abs(totals.vat - 10178.571428571428) < 0.001);
assert.equal(discountAmount(100000, { ...fixed, type: "PERCENT", value: 5 }), 5000);
assert.equal(discountAmount(112000, { ...fixed, type: "PERCENT", value: 5, basis: "VAT_EXCLUSIVE" }), 5000);
assert.equal(discountAmount(3000, { ...fixed, value: 100, scope: "PER_UNIT" }, 3), 300);
assert.equal(discountAmount(3000, { ...fixed, value: 100 }, 3), 100);
assert.throws(() => validateDiscount({ ...fixed, value: -1 }));
assert.throws(() => validateDiscount({ ...fixed, type: "PERCENT", value: 101 }));
assert.throws(() => discountAmount(100, defaultDiscount(101)));
assert.equal(allocateDiscount(10, [1, 1, 1]).reduce((a, b) => a + Math.round(b * 100), 0), 1000);
const itemTotals = quotationTotals("PER_LINE", { discountSettings: { ...defaultDiscount(), mode: "PER_ITEM" }, lineItems: [{ quantity: 3, unitPrice: 1000, discountSettings: { ...defaultDiscount(100), scope: "PER_UNIT" } }] });
assert.equal(itemTotals.grandTotal, 2700);
assert.deepEqual(parseQuotationRowValues(quotationRowValues({ discountSettings: fixed })).discountSettings, fixed);

const order = { discountSettings: defaultDiscount(10), version: 2 } as SalesOrder;
const line = { salesOrderItemId: "line-1", salesOrderId: "order-1", lineNo: 1, quantity: 3, unitPrice: 100, discountAmount: 0, taxMode: "VAT_INCLUSIVE", taxRate: 0.12, lineStatus: "ACTIVE", quotationLineReference: "Q-1", description: "Repair", priceSource: "QUOTATION" } as SalesOrderItem;
const lines = [{ ...line }];
applyOrderDiscounts(order, lines);
assert.equal(lines[0].lineTotal, 290);
assert.equal(lines[0].discountAmount, 10);
assert.equal(lines[0].taxAmount, 31.07);
const partialItems = [{ description: "Repair", quantity: 1, unitPrice: 100 }];
const partial = resolveInvoiceDiscount(partialItems, defaultDiscount(99), { order, items: lines });
assert.equal(partial.discountAmount, 3.33); // Source wins over manual input.
const allocations = allocateInvoiceDiscounts({ order, items: lines }, [{ items: partialItems }, { items: partialItems }, { items: partialItems }]);
assert.deepEqual(allocations.map(d => d.discountAmount), [3.34, 3.33, 3.33]);
assert.equal(allocations.reduce((a, d) => a + Math.round(d.discountAmount * 100), 0), 1000);
assert.equal(allocateInvoiceDiscounts({ order, items: lines }, [{ items: partialItems }])[0].discountAmount, 3.33);
assert.deepEqual(invoiceTotals({ items: [{ description: "Repair", quantity: 1, unitPrice: 100000 }], discountAmount: 5000 }), { subtotal: 100000, discount: 5000, grandTotal: 95000, vat: 10178.57, vatableAmount: 84821.43 });

const perItemOrder = { ...order, discountSettings: { ...defaultDiscount(), mode: "PER_ITEM" as const } };
const discountedLine = { ...line, discountSettings: { ...defaultDiscount(), type: "PERCENT" as const, value: 10 } };
applyOrderDiscounts(perItemOrder, [discountedLine]);
const inherited = resolveInvoiceDiscount(partialItems, undefined, { order: perItemOrder, items: [discountedLine] });
assert.equal(inherited.discountAmount, 10);
assert.equal(inherited.itemDiscounts[0].discountSettings?.type, "PERCENT");
const hydrated = partialItems.map(item => ({ ...item }));
hydrateInvoiceDiscount(hydrated, inherited);
assert.equal(invoiceTotals({ items: hydrated }).grandTotal, 90);
assert.throws(() => resolveInvoiceDiscount(partialItems, undefined, { order: perItemOrder, items: [discountedLine, { ...discountedLine, salesOrderItemId: "line-2" }] }), /matching Sales Order/);
// Old Sales Orders with only DiscountAmount still inherit their fixed line discounts.
assert.equal(resolveInvoiceDiscount(partialItems, undefined, { order: { version: 1 } as SalesOrder, items: [{ ...line, discountAmount: 30 }] }).discountAmount, 10);
const frozen = { ...inherited, discountAmount: 7 };
assert.equal(allocateInvoiceDiscounts({ order, items: lines }, [{ items: partialItems, status: "paid", discountData: frozen }, { items: partialItems, status: "created" }])[0].discountAmount, 7);
const exclusiveLine = { ...line, taxMode: "VAT_EXCLUSIVE" as const, discountAmount: 30 };
assert.equal(resolveInvoiceDiscount([{ description: "Repair", quantity: 1, unitPrice: 112 }], undefined, { order: { version: 1 } as SalesOrder, items: [exclusiveLine] }).discountAmount, 11.2);
console.log("Discount tests passed: taxes, percentage bases, scopes, inheritance, legacy lines, and exact partial allocation.");

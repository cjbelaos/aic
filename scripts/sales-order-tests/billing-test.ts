import assert from "node:assert/strict";
import {
  assertInvoiceFitsOrder,
  billingProgress,
  defaultBillingType,
  effectiveBillingType,
  SalesOrderBillingError,
} from "../../src/lib/salesOrders/billing.ts";

// Category defaults: service and PMS work bills as SR; parts, projects and the rest as SI.
assert.equal(defaultBillingType("Service"), "SERVICE_INVOICE");
assert.equal(defaultBillingType("Parts / PMS"), "SERVICE_INVOICE");
assert.equal(defaultBillingType("Parts"), "SALES_INVOICE");
assert.equal(defaultBillingType("Project"), "SALES_INVOICE");
assert.equal(defaultBillingType("Uncategorized"), "SALES_INVOICE");
assert.equal(defaultBillingType("Serviceable Parts"), "SALES_INVOICE", "word boundary, not substring");

// A stored choice wins; a legacy order follows its billed invoice, then the category.
assert.equal(effectiveBillingType({ billingType: "SERVICE_INVOICE" }, "Parts"), "SERVICE_INVOICE");
assert.equal(effectiveBillingType({ billingType: "" }, "Parts", [{ invoiceKind: "service", status: "created" }]), "SERVICE_INVOICE");
assert.equal(effectiveBillingType({ billingType: "" }, "Parts", [{ invoiceKind: "service", status: "cancelled" }]), "SALES_INVOICE");
assert.equal(effectiveBillingType({}, "Service"), "SERVICE_INVOICE");

// Progress counts draft/created/paid only, and clamps the remainder at zero.
assert.deepEqual(billingProgress(36300, [{ status: "created", total: 36300 }, { status: "void", total: 999 }]), { orderTotal: 36300, invoiced: 36300, remaining: 0, fullyInvoiced: true });
assert.deepEqual(billingProgress(1000, [{ status: "draft", total: 400.1 }, { status: "paid", total: 0.2 }]), { orderTotal: 1000, invoiced: 400.3, remaining: 599.7, fullyInvoiced: false });
assert.equal(billingProgress(0, []).fullyInvoiced, false, "an unpriced order is never 'fully invoiced'");

const base = { salesOrderNo: "AIC-SO-2026-1403", billingType: "SERVICE_INVOICE" as const, invoiceKind: "service" as const, orderTotal: 36300 };

// Exactly the remaining balance is allowed, including a partial split.
assert.doesNotThrow(() => assertInvoiceFitsOrder({ ...base, others: [], invoiceTotal: 36300 }));
assert.doesNotThrow(() => assertInvoiceFitsOrder({ ...base, others: [{ status: "created", total: 20000 }], invoiceTotal: 16300 }));
// Floating-point sums at the boundary still fit.
assert.doesNotThrow(() => assertInvoiceFitsOrder({ ...base, orderTotal: 0.3, others: [{ status: "created", total: 0.1 }], invoiceTotal: 0.2 }));

// One centavo over is blocked, and the message names the remaining balance.
assert.throws(
  () => assertInvoiceFitsOrder({ ...base, others: [{ status: "created", total: 20000 }], invoiceTotal: 16300.01 }),
  (error: unknown) => error instanceof SalesOrderBillingError && /₱16,300\.00 of ₱36,300\.00/.test(error.message),
);
// Cancelled/void invoices free their amount again.
assert.doesNotThrow(() => assertInvoiceFitsOrder({ ...base, others: [{ status: "cancelled", total: 36300 }], invoiceTotal: 36300 }));

// The wrong invoice type is blocked before any amount check.
assert.throws(
  () => assertInvoiceFitsOrder({ ...base, invoiceKind: "sales", others: [], invoiceTotal: 1 }),
  (error: unknown) => error instanceof SalesOrderBillingError && /billed by Service Invoice \(SR\)/.test(error.message),
);

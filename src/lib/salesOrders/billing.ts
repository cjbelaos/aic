// Sales Order billing rules: which invoice type bills an order, and how much of
// the order total is already invoiced. Pure functions only — no Sheets access.

import { roundCurrency } from "../discounts.ts";
import type { SalesOrderBillingType } from "../../types/salesOrder.ts";

export type InvoiceKind = "service" | "sales";

/** Invoice statuses that count toward an order's invoiced amount. */
export const BILLED_INVOICE_STATUSES: readonly string[] = ["draft", "created", "paid"];

export const BILLING_TYPE_LABELS: Record<SalesOrderBillingType, string> = {
  SERVICE_INVOICE: "Service Invoice (SR)",
  SALES_INVOICE: "Sales Invoice (SI)",
};

export function invoiceKindFor(type: SalesOrderBillingType): InvoiceKind {
  return type === "SERVICE_INVOICE" ? "service" : "sales";
}

export function billingTypeForKind(kind: InvoiceKind): SalesOrderBillingType {
  return kind === "service" ? "SERVICE_INVOICE" : "SALES_INVOICE";
}

export function isBillingType(value: unknown): value is SalesOrderBillingType {
  return value === "SERVICE_INVOICE" || value === "SALES_INVOICE";
}

/** New-order default: service and PMS work bills as SR, everything else as SI. */
export function defaultBillingType(category: string): SalesOrderBillingType {
  return /\b(service|services|pms)\b/i.test(category) ? "SERVICE_INVOICE" : "SALES_INVOICE";
}

/**
 * The billing type in force for an order. A stored choice wins; an order saved
 * before the field existed follows the invoice already issued against it, and
 * otherwise falls back to the category default.
 */
export function effectiveBillingType(
  order: { billingType?: SalesOrderBillingType | "" },
  category: string,
  linkedInvoices: ReadonlyArray<{ invoiceKind: InvoiceKind; status: string }> = [],
): SalesOrderBillingType {
  if (order.billingType) return order.billingType;
  const issued = linkedInvoices.find((invoice) => BILLED_INVOICE_STATUSES.includes(invoice.status));
  return issued ? billingTypeForKind(issued.invoiceKind) : defaultBillingType(category);
}

export interface BillingProgress {
  orderTotal: number;
  invoiced: number;
  remaining: number;
  fullyInvoiced: boolean;
}

/** VAT-inclusive invoiced amount against the order grand total. */
export function billingProgress(
  orderTotal: number,
  invoices: ReadonlyArray<{ status: string; total: number }>,
): BillingProgress {
  const invoiced = roundCurrency(invoices
    .filter((invoice) => BILLED_INVOICE_STATUSES.includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.total, 0));
  const remaining = roundCurrency(Math.max(0, orderTotal - invoiced));
  return { orderTotal: roundCurrency(orderTotal), invoiced, remaining, fullyInvoiced: orderTotal > 0 && remaining <= 0 };
}

export class SalesOrderBillingError extends Error {}

/**
 * Rejects an invoice of the wrong type for the order, or one that would push the
 * order's invoiced total above its grand total. `others` excludes the invoice
 * being saved.
 */
export function assertInvoiceFitsOrder(input: {
  salesOrderNo: string;
  billingType: SalesOrderBillingType;
  invoiceKind: InvoiceKind;
  orderTotal: number;
  others: ReadonlyArray<{ status: string; total: number }>;
  invoiceTotal: number;
}): void {
  if (invoiceKindFor(input.billingType) !== input.invoiceKind) {
    throw new SalesOrderBillingError(
      `${input.salesOrderNo || "This Sales Order"} is billed by ${BILLING_TYPE_LABELS[input.billingType]}. Change its billing type on the Sales Order to use a ${input.invoiceKind === "service" ? "Service Invoice" : "Sales Invoice"}.`,
    );
  }
  const { remaining } = billingProgress(input.orderTotal, input.others);
  if (roundCurrency(input.invoiceTotal) > remaining) {
    const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    throw new SalesOrderBillingError(
      `This invoice (${peso(input.invoiceTotal)}) exceeds the uninvoiced balance of ${input.salesOrderNo || "the Sales Order"} (${peso(remaining)} of ${peso(input.orderTotal)}).`,
    );
  }
}

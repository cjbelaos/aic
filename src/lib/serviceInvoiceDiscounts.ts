import { allocateDiscount, defaultDiscount, discountAmount, roundCurrency, type DiscountSettings } from "./discounts.ts";
import type { ServiceInvoiceItem } from "../types/serviceInvoice.ts";
import type { SalesOrder, SalesOrderItem } from "../types/salesOrder.ts";

export interface InvoiceDiscountData {
  sourceVersion?: number;
  discountSettings?: DiscountSettings;
  discountAmount: number;
  itemDiscounts: Array<{ salesOrderItemId?: string; discountSettings?: DiscountSettings; discountAmount: number }>;
}
export function invoiceTotals(invoice: { items: readonly ServiceInvoiceItem[]; discountAmount?: number }) {
  const subtotal = roundCurrency(invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const discount = invoice.discountAmount ?? invoice.items.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
  const grandTotal = roundCurrency(subtotal - discount);
  const vat = roundCurrency(grandTotal * 12 / 112);
  return { subtotal, discount, grandTotal, vat, vatableAmount: roundCurrency(grandTotal - vat) };
}

/** Linked orders always win over client-supplied discounts. Snapshot for other statuses. */
export function resolveInvoiceDiscount(items: readonly ServiceInvoiceItem[], manual?: DiscountSettings, source?: { order: SalesOrder; items: readonly SalesOrderItem[] }): InvoiceDiscountData {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!source) {
    const settings = manual ?? defaultDiscount();
    if (settings.mode !== "OVERALL") throw new Error("Manual service invoices use an overall discount.");
    return { discountSettings: settings, discountAmount: discountAmount(subtotal, settings), itemDiscounts: items.map(() => ({ discountAmount: 0 })) };
  }
  const eligible = source.items.filter(item => item.lineStatus === "ACTIVE" && item.priceSource !== "NOT_PRICED" && !item.quotationLineReference.endsWith(":SHIPPING"));
  const settings = source.order.discountSettings ?? { ...defaultDiscount(), mode: eligible.some(item => item.discountAmount) ? "PER_ITEM" as const : "OVERALL" as const };
  const inclusive = (item: SalesOrderItem) => item.taxMode === "VAT_EXCLUSIVE" ? 1 + item.taxRate : 1;
  const gross = eligible.reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0) * inclusive(item), 0);
  if (settings.mode === "OVERALL") {
    const deduction = eligible.reduce((sum, item) => sum + item.discountAmount * inclusive(item), 0);
    return { sourceVersion: source.order.version, discountSettings: settings, discountAmount: gross > 0 ? roundCurrency(deduction * subtotal / gross) : 0, itemDiscounts: items.map(() => ({ discountAmount: 0 })) };
  }
  const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  const itemDiscounts = items.map(item => {
    const matches = eligible.filter(line => item.salesOrderItemId ? line.salesOrderItemId === item.salesOrderItemId
      : item.productId ? line.productId === item.productId : key(line.description) === key(item.description));
    if (matches.length !== 1) throw new Error(`Select the matching Sales Order item for "${item.description}" to inherit its discount.`);
    const line = matches[0];
    const lineGross = (line.quantity ?? 0) * (line.unitPrice ?? 0);
    return { salesOrderItemId: line.salesOrderItemId, discountSettings: line.discountSettings ?? defaultDiscount(line.discountAmount), discountAmount: lineGross > 0 ? roundCurrency(line.discountAmount * item.quantity * item.unitPrice / lineGross) : 0 };
  });
  return { sourceVersion: source.order.version, discountSettings: settings, discountAmount: roundCurrency(itemDiscounts.reduce((sum, item) => sum + item.discountAmount, 0)), itemDiscounts };
}

export function invoiceDiscountSnapshot(value: unknown): InvoiceDiscountData | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as InvoiceDiscountData;
}

export function hydrateInvoiceDiscount(items: ServiceInvoiceItem[], snapshot?: InvoiceDiscountData): void {
  if (snapshot) items.forEach((item, index) => Object.assign(item, snapshot.itemDiscounts?.[index]));
}

export function allocateInvoiceDiscounts(source: { order: SalesOrder; items: readonly SalesOrderItem[] }, invoices: readonly { items: ServiceInvoiceItem[]; status?: string; discountData?: InvoiceDiscountData }[]): InvoiceDiscountData[] {
  const frozen = (invoice: (typeof invoices)[number]) => invoice.status !== undefined && !["draft", "created"].includes(invoice.status);
  const snapshots = invoices.map(invoice => frozen(invoice) ? invoice.discountData ?? { discountAmount: 0, itemDiscounts: [] } : resolveInvoiceDiscount(invoice.items, undefined, source));
  const mode = source.order.discountSettings?.mode ?? (source.items.some(item => item.discountAmount) ? "PER_ITEM" : "OVERALL");
  if (!snapshots.length || mode !== "OVERALL") return snapshots;
  const eligible = source.items.filter(item => item.lineStatus === "ACTIVE" && item.priceSource !== "NOT_PRICED" && !item.quotationLineReference.endsWith(":SHIPPING"));
  const multiplier = (item: SalesOrderItem) => item.taxMode === "VAT_EXCLUSIVE" ? 1 + item.taxRate : 1;
  const gross = eligible.reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0) * multiplier(item), 0);
  const deduction = eligible.reduce((sum, item) => sum + item.discountAmount * multiplier(item), 0);
  const weights = invoices.map(invoice => invoiceTotals({ items: invoice.items }).subtotal);
  const invoiced = weights.reduce((sum, value) => sum + value, 0);
  // Include the uninvoiced balance in allocation so partial invoices never absorb
  // the entire discount. Largest remainders distribute the last cent exactly.
  const shares = allocateDiscount(deduction, [...weights, Math.max(0, gross - invoiced)]);
  return snapshots.map((snapshot, index) => frozen(invoices[index]) ? snapshot : { ...snapshot, discountAmount: shares[index] });
}

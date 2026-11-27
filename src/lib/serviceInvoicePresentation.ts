import type { ServiceInvoiceItem } from "../types/serviceInvoice.ts";
import type { DeliveryItem } from "../types/deliveryReceipt.ts";
import type { SalesOrderItem } from "../types/salesOrder.ts";

export interface ServiceInvoiceContext {
  version: 1;
  serviceCompanyId?: string;
  serviceCompanyName?: string;
  /** DR company when the service location is the DR's FOR client; owns the contract / SO. */
  drCompanyId?: string;
}

/** Company that owns the linked DR's contract / sales order. */
export function serviceOwnerCompanyId(context?: ServiceInvoiceContext): string | undefined {
  return context?.drCompanyId ?? context?.serviceCompanyId;
}

export function invoicePrintItems(items: ServiceInvoiceItem[], context?: ServiceInvoiceContext): ServiceInvoiceItem[] {
  return context?.serviceCompanyName
    ? [...items, { description: `Service location: ${context.serviceCompanyName}`, quantity: 0, unitPrice: 0, notation: true }]
    : items;
}

/** Billable SO lines as invoice items: active, priced, not shipping, uncancelled quantity, VAT-inclusive price. */
export function salesOrderInvoiceItems(orderItems: readonly SalesOrderItem[]): ServiceInvoiceItem[] {
  return orderItems
    .filter(item => item.lineStatus === "ACTIVE" && item.priceSource !== "NOT_PRICED" && !item.quotationLineReference.endsWith(":SHIPPING"))
    .map(item => ({ salesOrderItemId: item.salesOrderItemId, productId: item.productId, description: item.description,
      quantity: Math.max(0, (item.quantity ?? 0) - item.cancelledQty),
      unitPrice: (item.unitPrice ?? 0) * (item.taxMode === "VAT_EXCLUSIVE" ? 1 + item.taxRate : 1) }))
    .filter(item => item.quantity > 0);
}

/** True when two item lists differ in description, quantity or price (to the centavo), ignoring line order. */
export function invoiceItemsDiffer(current: readonly ServiceInvoiceItem[], source: readonly ServiceInvoiceItem[]): boolean {
  const key = (item: ServiceInvoiceItem) => `${item.description.trim().replace(/\s+/g, " ").toUpperCase()}|${Number(item.quantity) || 0}|${Math.round((Number(item.unitPrice) || 0) * 100)}`;
  const a = current.map(key).sort(), b = source.map(key).sort();
  return a.length !== b.length || a.some((value, index) => value !== b[index]);
}

/** Only an unambiguous, active SO line supplies a price. DR quantities always win. */
export function invoiceItemsFromDelivery(items: DeliveryItem[], orderItems: readonly SalesOrderItem[] = []): ServiceInvoiceItem[] {
  return items.map(item => {
    const matches = orderItems.filter(line => line.lineStatus === "ACTIVE" && line.priceSource !== "NOT_PRICED" &&
      (item.salesOrderItemId ? line.salesOrderItemId === item.salesOrderItemId : item.productId ? line.productId === item.productId : line.description.trim().toUpperCase() === item.description.trim().toUpperCase()));
    const line = matches.length === 1 ? matches[0] : undefined;
    return { description: item.description, quantity: item.quantity, productId: item.productId,
      salesOrderItemId: line?.salesOrderItemId ?? item.salesOrderItemId,
      unitPrice: line ? (line.unitPrice ?? 0) * (line.taxMode === "VAT_EXCLUSIVE" ? 1 + line.taxRate : 1) : 0 };
  });
}

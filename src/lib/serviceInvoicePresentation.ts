import type { ServiceInvoiceItem } from "../types/serviceInvoice.ts";
import type { DeliveryItem } from "../types/deliveryReceipt.ts";
import type { SalesOrderItem } from "../types/salesOrder.ts";

export interface ServiceInvoiceContext {
  version: 1;
  serviceCompanyId?: string;
  serviceCompanyName?: string;
}

export function invoicePrintItems(items: ServiceInvoiceItem[], context?: ServiceInvoiceContext): ServiceInvoiceItem[] {
  return context?.serviceCompanyName
    ? [...items, { description: `Service location: ${context.serviceCompanyName}`, quantity: 0, unitPrice: 0, notation: true }]
    : items;
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

// Line rules for a Delivery Release linked to a Sales Order.
//
// A line with a salesOrderItemId must match an active PRODUCT line on the order
// and stay within its remaining quantity. A line without one is a part used to
// perform a service: allowed only when the order has an active SERVICE line.
// Such parts never post Sales Order fulfilment (deliverySalesOrderIntegration
// skips lines without a salesOrderItemId).

export interface OrderLineForDelivery {
  salesOrderItemId: string;
  lineType: string;
  lineStatus: string;
  productId: string;
  quantity: number | null;
  fulfilledQty: number;
  cancelledQty: number;
}

export interface DeliveryLineForOrder {
  salesOrderItemId?: string;
  productId?: string;
  quantity: number;
}

/** First rule violation as a user-facing message, or null when every line is valid. */
export function salesOrderDeliveryLineError(lines: DeliveryLineForOrder[], orderLines: OrderLineForDelivery[]): string | null {
  const byId = new Map(orderLines.map((line) => [line.salesOrderItemId, line]));
  const hasActiveService = orderLines.some((line) => line.lineType === "SERVICE" && line.lineStatus === "ACTIVE");
  for (const [index, item] of lines.entries()) {
    const n = index + 1;
    if (!item.salesOrderItemId) {
      if (hasActiveService) continue;
      return `Delivery line ${n} must reference an active product line on the selected Sales Order (the order has no active service line, so parts cannot be added).`;
    }
    const source = byId.get(item.salesOrderItemId);
    if (!source || source.lineType !== "PRODUCT" || source.lineStatus !== "ACTIVE") {
      return `Delivery line ${n} must reference an active product line on the selected Sales Order.`;
    }
    const remaining = Math.max(0, (source.quantity ?? 0) - source.fulfilledQty - source.cancelledQty);
    if (!(item.quantity > 0) || item.quantity > remaining) {
      return `Delivery line ${n} exceeds the selected Sales Order line's remaining quantity (${remaining}).`;
    }
    if (source.productId && item.productId && source.productId !== item.productId) {
      return `Delivery line ${n} does not match its selected Sales Order item.`;
    }
  }
  return null;
}

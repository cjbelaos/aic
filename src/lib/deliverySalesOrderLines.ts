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
  productCode?: string;
  description?: string;
  quantity: number;
}

/**
 * Links each hand-entered line whose product is an active PRODUCT line on the
 * order to that line, so it posts fulfilment instead of passing as a service
 * part. Lines already linked, or with no matching order line, are unchanged.
 */
export function linkOrderProductLines<T extends DeliveryLineForOrder>(lines: T[], orderLines: OrderLineForDelivery[]): T[] {
  return lines.map((item) => {
    if (item.salesOrderItemId || !item.productId) return item;
    const match = orderLines.find((line) => line.lineType === "PRODUCT" && line.lineStatus === "ACTIVE" && line.productId === item.productId);
    return match ? { ...item, salesOrderItemId: match.salesOrderItemId } : item;
  });
}

export interface FulfillmentForDelivery {
  fulfillmentId: string;
  salesOrderItemId: string;
  fulfillmentType: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceLineId: string;
  quantity: number;
  reversesFulfillmentId: string;
  status: string;
}

export interface PostedDeliveryLine {
  salesOrderItemId: string;
  /** Net of reversals; always > 0. */
  quantity: number;
}

/** What each line of this DR has already counted toward the order, keyed by deliveryReceiptItemId. */
export function postedDeliveryLines(fulfillments: FulfillmentForDelivery[], drNumber: number): Map<string, PostedDeliveryLine> {
  const posted = new Map<string, PostedDeliveryLine>();
  for (const source of fulfillments) {
    if (source.status !== "POSTED" || source.fulfillmentType !== "DELIVERY" || source.sourceDocumentType !== "DELIVERY_RECEIPT" || source.sourceDocumentId !== String(drNumber)) continue;
    const reversed = fulfillments
      .filter((entry) => entry.status === "POSTED" && entry.fulfillmentType === "REVERSAL" && entry.reversesFulfillmentId === source.fulfillmentId)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const net = Number((source.quantity - reversed).toFixed(2));
    if (net <= 0) continue;
    const prior = posted.get(source.sourceLineId);
    posted.set(source.sourceLineId, { salesOrderItemId: source.salesOrderItemId, quantity: (prior?.quantity ?? 0) + net });
  }
  return posted;
}

/** Order lines with this DR's own posted quantity given back, so its unchanged lines still fit when it is edited. */
export function withoutOwnFulfillment<T extends OrderLineForDelivery>(orderLines: T[], posted: Map<string, PostedDeliveryLine>): T[] {
  const own = new Map<string, number>();
  for (const line of posted.values()) own.set(line.salesOrderItemId, (own.get(line.salesOrderItemId) ?? 0) + line.quantity);
  return orderLines.map((line) => (own.has(line.salesOrderItemId) ? { ...line, fulfilledQty: line.fulfilledQty - (own.get(line.salesOrderItemId) ?? 0) } : line));
}

/**
 * Lines that already counted toward the order are fixed: an edit may not
 * remove them or change their quantity or Sales Order line. Returns a message
 * naming each such line, or null.
 */
export function postedLineEditError(
  lines: (DeliveryLineForOrder & { deliveryReceiptItemId?: string })[],
  storedLines: (DeliveryLineForOrder & { deliveryReceiptItemId?: string })[],
  posted: Map<string, PostedDeliveryLine>,
  salesOrderNo: string,
): string | null {
  const problems: string[] = [];
  storedLines.forEach((stored, index) => {
    const entry = stored.deliveryReceiptItemId ? posted.get(stored.deliveryReceiptItemId) : undefined;
    if (!entry) return;
    const editedIndex = lines.findIndex((line) => line.deliveryReceiptItemId === stored.deliveryReceiptItemId);
    const edited = lines[editedIndex];
    if (!edited) problems.push(`${lineLabel(stored, index + 1)} (removed; ${entry.quantity} already delivered)`);
    else if (edited.salesOrderItemId !== entry.salesOrderItemId || edited.quantity !== entry.quantity) {
      problems.push(`${lineLabel(edited, editedIndex + 1)} (changed; ${entry.quantity} already delivered)`);
    }
  });
  return problems.length
    ? `These lines already counted toward Sales Order ${salesOrderNo} and can't be changed or removed:\n${problems.map((l) => `• ${l}`).join("\n")}\nPut them back as they were, or delete this DR and create a new one.`
    : null;
}

function lineLabel(item: DeliveryLineForOrder, n: number): string {
  const name = String(item.description ?? "").split("\n")[0].trim() || item.productCode || "Unnamed item";
  return `Line ${n}: ${name}`;
}

/** Every rule violation as one user-facing message naming each line, or null when every line is valid. */
export function salesOrderDeliveryLineError(
  lines: DeliveryLineForOrder[],
  orderLines: OrderLineForDelivery[],
  salesOrderNo = "",
): string | null {
  const order = salesOrderNo ? `Sales Order ${salesOrderNo}` : "the selected Sales Order";
  const byId = new Map(orderLines.map((line) => [line.salesOrderItemId, line]));
  const hasActiveService = orderLines.some((line) => line.lineType === "SERVICE" && line.lineStatus === "ACTIVE");
  const notOnOrder: string[] = [];
  const overQuantity: string[] = [];
  const mismatched: string[] = [];
  let hasBlockedParts = false;

  for (const [index, item] of lines.entries()) {
    const label = lineLabel(item, index + 1);
    if (!item.salesOrderItemId) {
      if (hasActiveService) continue;
      hasBlockedParts = true;
      notOnOrder.push(label);
      continue;
    }
    const source = byId.get(item.salesOrderItemId);
    if (!source || source.lineType !== "PRODUCT" || source.lineStatus !== "ACTIVE") {
      notOnOrder.push(`${label} (no longer an active line on the order)`);
      continue;
    }
    if (source.productId && item.productId && source.productId !== item.productId) {
      mismatched.push(label);
      continue;
    }
    const remaining = Math.max(0, (source.quantity ?? 0) - source.fulfilledQty - source.cancelledQty);
    if (!(item.quantity > 0) || item.quantity > remaining) {
      overQuantity.push(`${label} (qty ${item.quantity}, only ${remaining} left to deliver)`);
    }
  }

  const sections: string[] = [];
  if (notOnOrder.length) {
    const why = hasBlockedParts ? "The order has no service line, so extra parts can't be added. " : "";
    sections.push(
      `These items are not on ${order}:\n${notOnOrder.map((l) => `• ${l}`).join("\n")}\n${why}Remove these lines, or add them to the Sales Order first.`,
    );
  }
  if (mismatched.length) {
    sections.push(`These lines don't match their Sales Order line:\n${mismatched.map((l) => `• ${l}`).join("\n")}\nRemove them and add them again.`);
  }
  if (overQuantity.length) {
    sections.push(`These quantities are more than what's left on ${order}:\n${overQuantity.map((l) => `• ${l}`).join("\n")}`);
  }
  return sections.length ? sections.join("\n\n") : null;
}

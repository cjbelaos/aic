import { createHash } from "node:crypto";
import { getDeliveryReceipts } from "@/lib/deliverySheets";
import { getOrderDetail, postFulfillments, type Actor } from "@/lib/salesOrders/service";

const FINAL_DELIVERY_STATUSES = new Set(["printed", "completed"]);

function stableCommandId(value: string): string {
  const bytes = createHash("sha256").update(value).digest();
  // Format the first 16 digest bytes as an RFC 4122 v4-shaped UUID. The input
  // determines the result; the version bits only make it acceptable to the
  // gateway's UUID validator.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export type DeliveryFulfillmentResult =
  | { state: "NOT_LINKED" | "NOT_FINAL"; posted: 0; alreadyPosted: 0 }
  | { state: "POSTED" | "ALREADY_POSTED"; posted: number; alreadyPosted: number };

/**
 * Posts product fulfillment from one finalized Delivery Release. Every source
 * line has a persisted immutable ID, and every command ID is deterministic for
 * that DR. Retrying after a lost response therefore reads the source evidence
 * first and cannot post the same quantity twice.
 */
export async function postFinalizedDeliveryReleaseFulfillment(
  drNumber: number,
  actor: Actor,
): Promise<DeliveryFulfillmentResult> {
  const release = (await getDeliveryReceipts()).find((item) => item.drNumber === drNumber);
  if (!release?.salesOrderId) return { state: "NOT_LINKED", posted: 0, alreadyPosted: 0 };
  if (!FINAL_DELIVERY_STATUSES.has(release.status.trim().toLowerCase())) {
    return { state: "NOT_FINAL", posted: 0, alreadyPosted: 0 };
  }

  const detail = await getOrderDetail(release.salesOrderId);
  const existingSources = new Set(
    detail.fulfillments
      .filter((entry) => entry.status === "POSTED" && entry.fulfillmentType === "DELIVERY" && entry.sourceDocumentType === "DELIVERY_RECEIPT" && entry.sourceDocumentId === String(drNumber))
      .map((entry) => entry.sourceLineId),
  );
  const entries = release.items.flatMap((item) => {
    if (!item.salesOrderItemId || !item.deliveryReceiptItemId || existingSources.has(item.deliveryReceiptItemId)) return [];
    return [{
      salesOrderItemId: item.salesOrderItemId,
      type: "DELIVERY" as const,
      quantity: item.quantity,
      effectiveDate: release.date,
      sourceDocumentType: "DELIVERY_RECEIPT",
      sourceDocumentId: String(drNumber),
      sourceLineId: item.deliveryReceiptItemId,
      evidenceDriveFileId: "",
      reversesFulfillmentId: "",
    }];
  });
  const alreadyPosted = release.items.filter((item) => item.deliveryReceiptItemId && existingSources.has(item.deliveryReceiptItemId)).length;
  if (entries.length === 0) return { state: "ALREADY_POSTED", posted: 0, alreadyPosted };

  await postFulfillments(actor, release.salesOrderId, {
    commandId: stableCommandId(`delivery-release-fulfillment:${drNumber}:${entries.map((entry) => entry.sourceLineId).sort().join(",")}`),
    expectedVersion: detail.order.version,
    entries,
  });
  return { state: "POSTED", posted: entries.length, alreadyPosted };
}

// purchaseRequest.ts — Purchase Requests raised by technicians against Confirmed Sales Orders.

/** Status stored on the PR row. Open / Partially handled / Completed are derived, never stored. */
export type PrStoredStatus = "DRAFT" | "SUBMITTED" | "CANCELLED";
export type PrStatus = "DRAFT" | "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED";

export const PR_STATUS_LABELS: Record<PrStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  PARTIAL: "Partially handled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export interface PurchaseRequest {
  prId: string;
  /** AIC-PR-YYYY-NNNN; empty while Draft. */
  prNo: string;
  status: PrStoredStatus;
  salesOrderId: string;
  salesOrderNoSnapshot: string;
  customerNameSnapshot: string;
  quotationNoSnapshot: string;
  deliveryAddressSnapshot: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedDate: string;
  neededByDate: string;
  purpose: string;
  cancelReason: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PurchaseRequestItem {
  prItemId: string;
  prId: string;
  lineNo: number;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitId: string;
  unitSnapshot: string;
  quantity: number;
  /** Optional: the Sales Order line this item is for (e.g. a BOM component). */
  salesOrderItemId: string;
  remarks: string;
  fromStockQty: number;
  fromStockNote: string;
  fromStockBy: string;
  fromStockAt: string;
  cancelledQty: number;
  cancelReason: string;
  cancelledBy: string;
  cancelledAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** One allocation of PR-line quantity to a PO line. */
export interface PurchaseRequestLink {
  linkId: string;
  poNumber: string;
  poItemNo: number;
  prId: string;
  prItemId: string;
  quantity: number;
  createdAt: string;
  createdBy: string;
}

export interface PrLineProgress {
  prItemId: string;
  quantity: number;
  /** Linked on POs whose status counts as ordered. */
  orderedQty: number;
  /** Linked on Draft POs (reserved, not yet ordered). */
  onDraftQty: number;
  fromStockQty: number;
  cancelledQty: number;
  /** quantity − ordered − fromStock − cancelled, floored at 0. */
  remaining: number;
  /** remaining − onDraftQty, floored at 0: what a new PO may still claim. */
  claimable: number;
  /** Distinct PO numbers that count as ordered, sorted. */
  poNumbers: string[];
}

export interface PoLineLinkInput {
  prItemId: string;
  quantity: number;
}

// Pure row <-> object mapping for the Purchase Request sheets (no Sheets client here, so tests can import it).
import { parseSheetNumber as num } from "../sheets.utils.ts";
import type { PrRequestType, PrStoredStatus, PurchaseRequest, PurchaseRequestItem, PurchaseRequestLink } from "../../types/purchaseRequest.ts";

const text = (value: unknown) => String(value ?? "").trim();

const REQUEST_TYPES: readonly PrRequestType[] = ["SALES_ORDER", "CONTRACT", "NONE"];

export function rowToPr(row: unknown[]): PurchaseRequest {
  const status = text(row[2]).toUpperCase();
  const type = text(row[19]).toUpperCase() as PrRequestType;
  return {
    prId: text(row[0]), prNo: text(row[1]),
    status: (["DRAFT", "SUBMITTED", "CANCELLED"].includes(status) ? status : "DRAFT") as PrStoredStatus,
    requestType: REQUEST_TYPES.includes(type) ? type : "SALES_ORDER",
    salesOrderId: text(row[3]), salesOrderNoSnapshot: text(row[4]), customerNameSnapshot: text(row[5]),
    quotationNoSnapshot: text(row[6]), deliveryAddressSnapshot: text(row[7]), requestedByUserId: text(row[8]),
    requestedByName: text(row[9]), requestedDate: text(row[10]), neededByDate: text(row[11]), purpose: text(row[12]),
    cancelReason: text(row[13]), version: num(row[14]) || 1, createdAt: text(row[15]), createdBy: text(row[16]),
    updatedAt: text(row[17]), updatedBy: text(row[18]), contractId: text(row[20]), contractNoSnapshot: text(row[21]),
  };
}

export function prToRow(pr: PurchaseRequest): unknown[] {
  return [pr.prId, pr.prNo, pr.status, pr.salesOrderId, pr.salesOrderNoSnapshot, pr.customerNameSnapshot, pr.quotationNoSnapshot,
    pr.deliveryAddressSnapshot, pr.requestedByUserId, pr.requestedByName, pr.requestedDate, pr.neededByDate, pr.purpose,
    pr.cancelReason, pr.version, pr.createdAt, pr.createdBy, pr.updatedAt, pr.updatedBy, pr.requestType, pr.contractId, pr.contractNoSnapshot];
}

export function rowToItem(row: unknown[]): PurchaseRequestItem {
  return {
    prItemId: text(row[0]), prId: text(row[1]), lineNo: num(row[2]), productId: text(row[3]),
    productCodeSnapshot: text(row[4]), productNameSnapshot: text(row[5]), unitId: text(row[6]), unitSnapshot: text(row[7]),
    quantity: num(row[8]), salesOrderItemId: text(row[9]), remarks: text(row[10]),
    fromStockQty: num(row[11]), fromStockNote: text(row[12]), fromStockBy: text(row[13]), fromStockAt: text(row[14]),
    cancelledQty: num(row[15]), cancelReason: text(row[16]), cancelledBy: text(row[17]), cancelledAt: text(row[18]),
    createdAt: text(row[19]), createdBy: text(row[20]), updatedAt: text(row[21]), updatedBy: text(row[22]), contractItemId: text(row[23]),
  };
}

export function itemToRow(i: PurchaseRequestItem): unknown[] {
  return [i.prItemId, i.prId, i.lineNo, i.productId, i.productCodeSnapshot, i.productNameSnapshot, i.unitId, i.unitSnapshot,
    i.quantity, i.salesOrderItemId, i.remarks, i.fromStockQty, i.fromStockNote, i.fromStockBy, i.fromStockAt, i.cancelledQty,
    i.cancelReason, i.cancelledBy, i.cancelledAt, i.createdAt, i.createdBy, i.updatedAt, i.updatedBy, i.contractItemId];
}

export function rowToLink(row: unknown[]): PurchaseRequestLink {
  return {
    linkId: text(row[0]), poNumber: text(row[1]), poItemNo: num(row[2]), prId: text(row[3]),
    prItemId: text(row[4]), quantity: num(row[5]), createdAt: text(row[6]), createdBy: text(row[7]),
  };
}

// Sales Order domain rules: numbering, status transitions, money projections,
// fulfillment math, cancellation/reversal, confirmation readiness.
// Pure functions only — no Sheets or session access.

import type { FulfillmentStatus, OrderStatus, PriceSource, SalesOrder, SalesOrderItem, TaxMode } from "../../types/salesOrder.ts";
import { SALES_ORDER_SO_NUMBER_PATTERN } from "../../types/salesOrder.ts";
import { computeLineMoney, roundMoney, sumOrderTotals } from "./money.ts";

export const SO_NUMBER_PREFIX = "AIC-SO";

export function formatSalesOrderNo(year: string, lastNumber: number): string {
  return `${SO_NUMBER_PREFIX}-${year}-${String(lastNumber).padStart(4, "0")}`;
}

export function parseSalesOrderNo(value: string): { year: string; number: number } | null {
  const match = value.trim().toUpperCase().match(SALES_ORDER_SO_NUMBER_PATTERN);
  if (!match) return null;
  const number = Number(match[2]);
  if (number < 1) return null; // AIC-SO-YYYY-0000 is never allocated or accepted
  return { year: match[1], number };
}

export function isValidSalesOrderNo(value: string): boolean {
  return parseSalesOrderNo(value) !== null;
}

export function nextSalesOrderNo(sequence: { businessYear: string; lastNumber: number }): string {
  return formatSalesOrderNo(sequence.businessYear, sequence.lastNumber + 1);
}
export const ORDER_TRANSITIONS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ["DRAFT", "CONFIRMED"],
  ["CONFIRMED", "ON_HOLD"],
  ["ON_HOLD", "CONFIRMED"],
  ["CONFIRMED", "CANCELLED"],
  ["ON_HOLD", "CANCELLED"],
  ["CONFIRMED", "CLOSED"],
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export function deriveOrderCategory(items: readonly Pick<SalesOrderItem, "orderCategory" | "lineStatus">[]): string {
  const unique = [
    ...new Set(
      items
        .filter((item) => item.lineStatus === "ACTIVE")
        .map((item) => item.orderCategory.trim())
        .filter((category) => category.length > 0),
    ),
  ];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  return "Mixed";
}

export function deriveFulfillmentStatus(items: readonly Pick<SalesOrderItem, "lineStatus" | "quantity" | "cancelledQty" | "fulfilledQty">[]): FulfillmentStatus {
  const active = items.filter((item) => item.lineStatus === "ACTIVE" && item.quantity !== null && item.quantity > 0);
  if (active.length === 0) return "NOT_APPLICABLE";
  const allDone = active.every((item) => item.cancelledQty >= (item.quantity ?? 0) || item.fulfilledQty >= (item.quantity ?? 0) - item.cancelledQty);
  if (allDone) return "FULFILLED";
  const anyFulfilled = active.some((item) => item.fulfilledQty > 0);
  return anyFulfilled ? "PARTIAL" : "UNFULFILLED";
}
export function remainingDemand(item: Pick<SalesOrderItem, "quantity" | "cancelledQty" | "fulfilledQty">): number {
  if (item.quantity === null) return 0;
  return Math.max(0, item.quantity - (item.cancelledQty ?? 0) - (item.fulfilledQty ?? 0));
}

export function postFulfillment(item: SalesOrderItem, quantity: number): SalesOrderItem {
  const qty = roundMoney(quantity);
  if (!(qty > 0)) throw new Error("Fulfillment quantity must be greater than zero.");
  const remaining = remainingDemand(item);
  if (qty > remaining) throw new Error(`Fulfillment of ${qty} exceeds the remaining demand of ${remaining}.`);
  return { ...item, fulfilledQty: roundMoney(qty + item.fulfilledQty) };
}

export function applyReversalToItem(item: SalesOrderItem, quantity: number): SalesOrderItem {
  const qty = roundMoney(quantity);
  if (!(qty > 0)) throw new Error("Reversal quantity must be greater than zero.");
  if (qty > item.fulfilledQty) throw new Error(`Reversal of ${qty} exceeds the fulfilled quantity of ${item.fulfilledQty}.`);
  return { ...item, fulfilledQty: roundMoney(item.fulfilledQty - qty) };
}
export function applyCancellationToItem(item: SalesOrderItem, quantity: number): SalesOrderItem {
  const qty = roundMoney(quantity);
  if (!(qty > 0)) throw new Error("Cancelled quantity must be greater than zero.");
  const open = item.quantity === null ? 0 : Math.max(0, item.quantity - item.cancelledQty - item.fulfilledQty);
  if (qty > open) throw new Error(`Cancelling ${qty} exceeds the outstanding quantity of ${open}.`);
  if (item.cancelledQty + qty > (item.quantity ?? 0) - item.fulfilledQty) {
    throw new Error("Cancelled quantity cannot reduce remaining demand below the fulfilled quantity.");
  }
  return { ...item, cancelledQty: roundMoney(item.cancelledQty + qty) };
}

export function deactivateLine(item: SalesOrderItem): SalesOrderItem {
  if (item.lineStatus === "ACTIVE" && item.fulfilledQty > 0) {
    throw new Error("A line with fulfilled quantity cannot be deactivated; cancel or reverse first.");
  }
  return { ...item, lineStatus: "INACTIVE" };
}

export function recalculateItemMoney(item: Pick<SalesOrderItem, "quantity" | "unitPrice" | "discountAmount" | "taxMode" | "taxRate">): Pick<SalesOrderItem, "subtotalExTax" | "taxAmount" | "lineTotal"> {
  const money = computeLineMoney({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxMode: item.taxMode,
    taxRate: item.taxRate,
  });
  return { subtotalExTax: money.baseAmount, taxAmount: money.taxAmount, lineTotal: money.lineTotal };
}
export function recalculateOrderTotals(items: readonly Pick<SalesOrderItem, "subtotalExTax" | "discountAmount" | "taxAmount" | "lineTotal" | "lineStatus">[]) {
  const active = items.filter((item) => item.lineStatus === "ACTIVE");
  const totals = sumOrderTotals(
    active.map((entry) => ({
      baseAmount: entry.subtotalExTax,
      discountAmount: entry.discountAmount,
      taxAmount: entry.taxAmount,
      lineTotal: entry.lineTotal,
    })),
  );
  return {
    subtotalExTax: totals.subtotalExTax,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
  };
}
export interface ConfirmReadinessInput {
  order: Pick<SalesOrder, "customerId" | "receivedDate" | "currency" | "orderStatus" | "assignedToUserId">;
  items: Array<Pick<SalesOrderItem, "lineStatus" | "lineType" | "productId" | "description" | "unitId" | "quantity" | "unitPrice">>;
  assignmentOptional: boolean;
}

export function collectConfirmationIssues(input: ConfirmReadinessInput): string[] {
  const issues: string[] = [];
  if (!input.order.customerId?.trim()) issues.push("A customer is required before confirmation.");
  if (!input.order.receivedDate?.trim()) issues.push("Received date is required before confirmation.");
  if (!input.order.currency?.trim()) issues.push("Currency is required before confirmation.");
  if (!input.assignmentOptional && !input.order.assignedToUserId?.trim()) {
    issues.push("An assignee (PIC) is required before confirmation when assignment is mandatory.");
  }
  const active = input.items.filter((item) => item.lineStatus === "ACTIVE");
  if (active.length === 0) issues.push("At least one active line is required before confirmation.");
  active.forEach((item, index) => {
    if (!isLineConfirmationReady(item)) issues.push(`Line ${index + 1} is incomplete (product, description, unit, quantity and price are required).`);
  });
  return issues;
}

export function isLineConfirmationReady(item: Pick<SalesOrderItem, "lineType" | "productId" | "description" | "unitId" | "quantity" | "unitPrice">): boolean {
  if (item.lineType === "PRODUCT" && !item.productId?.trim()) return false;
  if (!item.description?.trim()) return false;
  if (!item.unitId?.trim()) return false;
  if (item.quantity === null || item.quantity === undefined || !(item.quantity > 0)) return false;
  if (item.unitPrice === null || item.unitPrice === undefined || item.unitPrice < 0) return false;
  return true;
}
export function priceSourceLabel(source: PriceSource | string): string {
  switch (source) {
    case "QUOTATION": return "Quotation";
    case "CUSTOMER_PRICE": return "Customer price";
    case "DEFAULT_PRICE": return "Default price";
    case "MANUAL": return "Manual";
    case "LEGACY": return "Legacy";
    default: return source;
  }
}

export interface QuotationConversionPlan {
  sourceNo: string;
  lines: Array<Pick<SalesOrderItem, "lineNo" | "lineType" | "productId" | "productCodeSnapshot" | "description" | "unitId" | "unitSnapshot" | "quantity" | "unitPrice" | "priceSource" | "discountAmount" | "taxMode" | "taxRate" | "customerProductNameSnapshot">>;
}

export function conversionPlanFromQuotation(quotation: {
  quotationNo: string;
  items: Array<{ productId?: string; productCodeSnapshot?: string; description: string; quantity: number; unit: string; unitPrice: number }>;
  shippingFee?: number;
  defaultTaxMode: TaxMode;
  defaultTaxRate: number;
}): QuotationConversionPlan {
  const itemLines: QuotationConversionPlan["lines"] = quotation.items.map((item, index) => ({
    lineNo: index + 1,
    lineType: item.productId ? "PRODUCT" : "SERVICE",
    productId: item.productId ?? "",
    productCodeSnapshot: item.productCodeSnapshot ?? "",
    description: item.description,
    unitId: item.unit,
    unitSnapshot: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    priceSource: "QUOTATION",
    discountAmount: 0,
    taxMode: quotation.defaultTaxMode,
    taxRate: quotation.defaultTaxRate,
    customerProductNameSnapshot: "",
  }));
  const shippingFee = Number(quotation.shippingFee ?? 0);
  if (shippingFee > 0) {
    itemLines.push({
      lineNo: itemLines.length + 1,
      lineType: "SERVICE",
      productId: "",
      productCodeSnapshot: "",
      description: "Shipping Fee",
      unitId: "LOT",
      unitSnapshot: "LOT",
      quantity: 1,
      unitPrice: shippingFee,
      priceSource: "QUOTATION",
      discountAmount: 0,
      taxMode: quotation.defaultTaxMode,
      taxRate: quotation.defaultTaxRate,
      customerProductNameSnapshot: "Shipping Fee",
    });
  }
  return {
    sourceNo: quotation.quotationNo,
    lines: itemLines,
  };
}

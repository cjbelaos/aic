// Sales Order domain rules: numbering, status transitions, money projections,
// fulfillment math, cancellation/reversal, confirmation readiness.
// Pure functions only — no Sheets or session access.

import type { FulfillmentStatus, OrderStatus, PriceSource, SalesOrder, SalesOrderItem, TaxMode } from "../../types/salesOrder.ts";
import {
  COMBINED_CHARGE_DESCRIPTION,
  PRICE_SOURCE_NOT_PRICED,
  SALES_ORDER_PRODUCT_CATEGORY,
  SALES_ORDER_SERVICE_CATEGORY,
  SALES_ORDER_SO_NUMBER_PATTERN,
  SHIPPING_LINE_DESCRIPTION,
} from "../../types/salesOrder.ts";
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
/**
 * A descriptive line covered by one combined quotation charge: it has no price
 * of its own (unitPrice blank) and therefore contributes nothing to the totals.
 * Unknown blank prices on other sources stay distinguishable because they keep
 * their own PriceSource.
 */
export function isNotPricedLine(item: { priceSource?: string | null }): boolean {
  return String(item.priceSource ?? "").trim().toUpperCase() === PRICE_SOURCE_NOT_PRICED;
}

/** Money projection for any line, including non-priced descriptive lines. */
export function recalculateItemMoneyForLine(
  item: Pick<SalesOrderItem, "quantity" | "unitPrice" | "discountAmount" | "taxMode" | "taxRate"> & { priceSource?: string | null },
): Pick<SalesOrderItem, "subtotalExTax" | "taxAmount" | "lineTotal"> {
  if (isNotPricedLine(item)) return { subtotalExTax: 0, taxAmount: 0, lineTotal: 0 };
  return recalculateItemMoney(item);
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
  items: Array<Pick<SalesOrderItem, "lineStatus" | "lineType" | "productId" | "description" | "unitId" | "quantity" | "unitPrice"> & { priceSource?: string | null }>;
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

export function isLineConfirmationReady(item: Pick<SalesOrderItem, "lineType" | "productId" | "description" | "unitId" | "quantity" | "unitPrice"> & { priceSource?: string | null }): boolean {
  if (item.lineType === "PRODUCT" && !item.productId?.trim()) return false;
  if (!item.description?.trim()) return false;
  if (!item.unitId?.trim()) return false;
  if (item.quantity === null || item.quantity === undefined || !(item.quantity > 0)) return false;
  // A descriptive line of a single-total quotation carries no price of its own;
  // its share lives once on the combined charge line, so no price is required.
  if (isNotPricedLine(item)) return true;
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
    case PRICE_SOURCE_NOT_PRICED: return "Included in combined total";
    default: return source;
  }
}

export interface QuotationConversionPlan {
  sourceNo: string;
  /** Pricing mode copied from the quotation (PER_LINE keeps historical behaviour). */
  pricingMode: QuotationConversionMode;
  /**
   * The exact combined charge carried onto its own Sales Order line in
   * SINGLE_TOTAL mode (0 in per-line mode). No per-line price is derived from it.
   */
  combinedTotal: number;
  /** Quotation-level discount applied to the combined charge line. */
  combinedDiscount: number;
  lines: Array<Pick<SalesOrderItem, "lineNo" | "lineType" | "productId" | "productCodeSnapshot" | "description" | "unitId" | "unitSnapshot" | "quantity" | "unitPrice" | "priceSource" | "discountAmount" | "taxMode" | "taxRate" | "customerProductNameSnapshot">>;
}

export type QuotationConversionMode = "PER_LINE" | "SINGLE_TOTAL";

/** Application-layer category for a converted line (services never ask the user). */
export function convertedLineCategory(line: { lineType: string }): string {
  return line.lineType === "SERVICE" ? SALES_ORDER_SERVICE_CATEGORY : SALES_ORDER_PRODUCT_CATEGORY;
}

export function conversionPlanFromQuotation(quotation: {
  quotationNo: string;
  items: Array<{ productId?: string; productCodeSnapshot?: string; description: string; quantity: number; unit: string; unitPrice: number }>;
  shippingFee?: number;
  defaultTaxMode: TaxMode;
  defaultTaxRate: number;
  /** Pricing mode of the source quotation; omitted means the historical mode. */
  pricingMode?: string | null;
  /** The one combined price quoted for the whole job (single-total mode). */
  singleTotalPrice?: number | null;
  /** Quotation-level discount, carried as the combined charge line discount. */
  discount?: number | null;
}): QuotationConversionPlan {
  const pricingMode: QuotationConversionMode =
    String(quotation.pricingMode ?? "").trim().toUpperCase() === "SINGLE_TOTAL" ? "SINGLE_TOTAL" : "PER_LINE";
  const tax = { taxMode: quotation.defaultTaxMode, taxRate: quotation.defaultTaxRate };
  const shippingFee = Number(quotation.shippingFee ?? 0);

  if (pricingMode === "SINGLE_TOTAL") {
    // Every described product/service keeps its own visible, priced-free line so
    // the order matches the quotation line for line; the money lives once on the
    // combined charge line below.
    const descriptive: QuotationConversionPlan["lines"] = quotation.items.map((item, index) => ({
      lineNo: index + 1,
      lineType: item.productId ? "PRODUCT" : "SERVICE",
      productId: item.productId ?? "",
      productCodeSnapshot: item.productCodeSnapshot ?? "",
      description: item.description,
      unitId: item.unit,
      unitSnapshot: item.unit,
      quantity: item.quantity > 0 ? item.quantity : null,
      unitPrice: null,
      priceSource: PRICE_SOURCE_NOT_PRICED,
      discountAmount: 0,
      ...tax,
      customerProductNameSnapshot: "",
    }));
    const combinedTotal = Math.max(0, Number(quotation.singleTotalPrice ?? 0) || 0);
    if (combinedTotal > 0) {
      const discount = Math.max(0, Number(quotation.discount ?? 0) || 0);
      descriptive.push({
        lineNo: descriptive.length + 1,
        lineType: "SERVICE",
        productId: "",
        productCodeSnapshot: "",
        description: COMBINED_CHARGE_DESCRIPTION,
        unitId: "LOT",
        unitSnapshot: "LOT",
        quantity: 1,
        unitPrice: combinedTotal,
        priceSource: "QUOTATION",
        discountAmount: Math.min(discount, combinedTotal),
        ...tax,
        customerProductNameSnapshot: "",
      });
    }
    if (shippingFee > 0) {
      descriptive.push({
        lineNo: descriptive.length + 1,
        lineType: "SERVICE",
        productId: "",
        productCodeSnapshot: "",
        description: SHIPPING_LINE_DESCRIPTION,
        unitId: "LOT",
        unitSnapshot: "LOT",
        quantity: 1,
        unitPrice: shippingFee,
        priceSource: "QUOTATION",
        discountAmount: 0,
        ...tax,
        customerProductNameSnapshot: SHIPPING_LINE_DESCRIPTION,
      });
    }
    return {
      sourceNo: quotation.quotationNo,
      pricingMode,
      combinedTotal,
      combinedDiscount: Math.min(Math.max(0, Number(quotation.discount ?? 0) || 0), combinedTotal),
      lines: descriptive,
    };
  }

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
    ...tax,
    customerProductNameSnapshot: "",
  }));
  if (shippingFee > 0) {
    itemLines.push({
      lineNo: itemLines.length + 1,
      lineType: "SERVICE",
      productId: "",
      productCodeSnapshot: "",
      description: SHIPPING_LINE_DESCRIPTION,
      unitId: "LOT",
      unitSnapshot: "LOT",
      quantity: 1,
      unitPrice: shippingFee,
      priceSource: "QUOTATION",
      discountAmount: 0,
      ...tax,
      customerProductNameSnapshot: SHIPPING_LINE_DESCRIPTION,
    });
  }
  return {
    sourceNo: quotation.quotationNo,
    pricingMode,
    combinedTotal: 0,
    combinedDiscount: 0,
    lines: itemLines,
  };
}

import { allocateDiscount, defaultDiscount, discountAmount, validateDiscount } from "../discounts.ts";
import type { SalesOrder, SalesOrderItem } from "../../types/salesOrder.ts";
import { computeLineMoney } from "./money.ts";

/** Persist allocations on lines so all existing reporting and totals remain consistent. */
export function applyOrderDiscounts(order: Pick<SalesOrder, "discountSettings">, items: SalesOrderItem[]): void {
  if (!order.discountSettings) return; // Historical fixed line deductions remain intact.
  const settings = validateDiscount(order.discountSettings);
  const active = items.filter(item => item.lineStatus === "ACTIVE" && item.priceSource !== "NOT_PRICED");
  const eligible = active.filter(item => !item.quotationLineReference.endsWith(":SHIPPING"));
  const weights = eligible.map(item => (item.quantity ?? 0) * (item.unitPrice ?? 0));
  const gross = weights.reduce((a, b) => a + b, 0);
  // Percent basis follows each line's tax mode, which also supports mixed VAT orders.
  const overall = settings.mode !== "OVERALL" ? 0 : settings.type === "PERCENT"
    ? eligible.reduce((sum, item, index) => sum + discountAmount(weights[index], settings, 1, item.taxMode, item.taxRate), 0)
    : discountAmount(gross, settings);
  const allocations = settings.mode === "OVERALL" ? allocateDiscount(overall, weights) : [];
  for (const item of active) {
    const index = eligible.indexOf(item);
    if (settings.mode === "OVERALL" && item.discountSettings?.value) throw new Error("Overall and item discounts cannot be combined.");
    const amount = index < 0 ? 0 : settings.mode === "OVERALL" ? allocations[index]
      : item.discountSettings ? discountAmount(weights[index], item.discountSettings, item.quantity ?? 0, item.taxMode, item.taxRate) : item.discountAmount;
    const money = computeLineMoney({ ...item, discountAmount: amount });
    Object.assign(item, { discountAmount: amount, subtotalExTax: money.baseAmount, taxAmount: money.taxAmount, lineTotal: money.lineTotal });
  }
}

export function effectiveOrderDiscount(order: Pick<SalesOrder, "discountSettings">, items: readonly SalesOrderItem[]) {
  return order.discountSettings ?? { ...defaultDiscount(), mode: items.some(item => item.discountAmount > 0) ? "PER_ITEM" as const : "OVERALL" as const };
}

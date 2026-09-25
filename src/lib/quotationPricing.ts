/**
 * Quotation pricing modes — pure module (no React, no Google, no node APIs) so
 * the editor, the Sheets persistence layer, the conversion code and the focused
 * Node tests all share one definition of the money rules.
 *
 * PER_LINE      — the historical behaviour: every line carries its own quantity
 *                 and unit price and the quotation subtotal is the line sum.
 * SINGLE_TOTAL  — the manager describes many products/services and quotes one
 *                 combined price for the whole job. All descriptive lines stay
 *                 visible, the price is entered once at quotation level, and no
 *                 per-line price is ever derived (never divide the total).
 *
 * The grand-total formula is unchanged from the original editor:
 *   grandTotal = max(priceBasis − discount, 0) + shippingFee
 *   vat        = grandTotal × 12/112   (VAT-inclusive amount)
 * so existing quotations keep their historical totals byte-for-byte and the
 * single-total mode simply moves `priceBasis` from the line sum to the one
 * combined price.
 */

import type { QuotationLineKind, QuotationPricingMode } from "../types/quotation.ts";

export const QUOTATION_PRICING_MODES: readonly QuotationPricingMode[] = [
  "PER_LINE",
  "SINGLE_TOTAL",
];

export const DEFAULT_QUOTATION_PRICING_MODE: QuotationPricingMode = "PER_LINE";

/** VAT fraction extracted from the VAT-inclusive grand total (Philippine 12%). */
export const QUOTATION_VAT_FRACTION = 12 / 112;

/** UI wording for the two modes. */
export const PER_LINE_PRICING_LABEL = "Price every line";
export const SINGLE_TOTAL_PRICING_LABEL = "One total price";
export const SINGLE_TOTAL_PRICE_LABEL = "Total price for the whole job";

/**
 * The combined charge is the only priced line of a single-total quotation, so it
 * is auditable on its own. Anything else is a descriptive line with no price.
 */
export function normalizeQuotationPricingMode(value: unknown): QuotationPricingMode {
  return String(value ?? "").trim().toUpperCase() === "SINGLE_TOTAL"
    ? "SINGLE_TOTAL"
    : "PER_LINE";
}

export function isSingleTotalPricing(value: unknown): boolean {
  return normalizeQuotationPricingMode(value) === "SINGLE_TOTAL";
}

/** A quotation line is a catalog product line only when a product reference exists. */
export function quotationLineKind(item: { productId?: string | null }): QuotationLineKind {
  return String(item.productId ?? "").trim() ? "PRODUCT" : "SERVICE";
}

/** Coerces a persisted/legacy money value to a finite non-negative number. */
export function asMoney(value: unknown): number {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export interface QuotationLineAmount {
  quantity: number;
  unitPrice: number;
}

export interface QuotationTotalsInput {
  /** Lines in the editor. Always summed so per-line prices are never lost. */
  lineItems: readonly QuotationLineAmount[];
  /** The one combined price entered in SINGLE_TOTAL mode. */
  singleTotalPrice?: number;
  discount?: number;
  shippingFee?: number;
}

export interface QuotationTotals {
  /** Sum of every line amount (equal to the line-mode subtotal). */
  lineSubTotal: number;
  /** Base the discount and shipping fee apply to (line sum or combined price). */
  priceBasis: number;
  subtotal: number;
  discount: number;
  shippingFee: number;
  grandTotal: number;
  vat: number;
  vatableAmount: number;
}

function lineAmountSum(lineItems: readonly QuotationLineAmount[]): number {
  return lineItems.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
}

/**
 * Quotation totals for the active pricing mode. In SINGLE_TOTAL mode the
 * combined price replaces the line sum as the basis; per-line prices are still
 * summed and returned as `lineSubTotal` (informational only — nothing divides
 * the combined total across the lines).
 */
export function quotationTotals(
  pricingMode: unknown,
  input: QuotationTotalsInput,
): QuotationTotals {
  const lineSubTotal = lineAmountSum(input.lineItems ?? []);
  const singleTotalPrice = asMoney(input.singleTotalPrice);
  const discount = asMoney(input.discount);
  const shippingFee = asMoney(input.shippingFee);
  const priceBasis = isSingleTotalPricing(pricingMode) ? singleTotalPrice : lineSubTotal;
  const grandTotal = Math.max(priceBasis - discount, 0) + shippingFee;
  const vat = grandTotal * QUOTATION_VAT_FRACTION;
  return {
    lineSubTotal,
    priceBasis,
    subtotal: priceBasis,
    discount,
    shippingFee,
    grandTotal,
    vat,
    vatableAmount: grandTotal - vat,
  };
}

export interface QuotationPricingRecord {
  pricingMode?: unknown;
  singleTotalPrice?: unknown;
  amount?: unknown;
  discount?: unknown;
  shippingFee?: unknown;
  items?: readonly QuotationLineAmount[];
}

/**
 * The combined price of a stored quotation. Records written before the pricing
 * columns existed (or a quotation switched to single-total before a price was
 * typed) fall back to the stored grand total, which is exact for the published
 * total formula. Returns 0 for per-line quotations.
 */
export function singleTotalPriceFromRecord(record: QuotationPricingRecord): number {
  if (!isSingleTotalPricing(record.pricingMode)) return 0;
  const stored = asMoney(record.singleTotalPrice);
  if (stored > 0) return stored;
  const derived = asMoney(record.amount) - asMoney(record.shippingFee) + asMoney(record.discount);
  return Math.max(0, derived);
}

export interface PricingModeSwitchInput {
  from: QuotationPricingMode;
  to: QuotationPricingMode;
  lineItems: readonly QuotationLineAmount[];
  singleTotalPrice: number;
}

export interface PricingModeSwitchResult {
  mode: QuotationPricingMode;
  /** Combined price to keep in state (never silently discards entered pricing). */
  singleTotalPrice: number;
  /** True when the combined price was seeded from the per-line sum. */
  seededFromLines: boolean;
  note: string;
}

/**
 * Safe mode switching: descriptions and per-line prices always stay in state
 * (they are persisted on the lines either way), and the combined price is only
 * seeded from the line sum when the user has not entered one yet. Switching back
 * to per-line pricing restores the line prices unchanged.
 */
export function planPricingModeSwitch(input: PricingModeSwitchInput): PricingModeSwitchResult {
  const mode = normalizeQuotationPricingMode(input.to);
  const current = asMoney(input.singleTotalPrice);
  if (mode === input.from) {
    return { mode, singleTotalPrice: current, seededFromLines: false, note: "" };
  }
  if (mode === "SINGLE_TOTAL") {
    if (current > 0) {
      return {
        mode,
        singleTotalPrice: current,
        seededFromLines: false,
        note: "Single total price is on. The line prices you already entered are kept but hidden while this mode is selected.",
      };
    }
    return {
      mode,
      singleTotalPrice: lineAmountSum(input.lineItems),
      seededFromLines: true,
      note: "Single total price is on. The combined price started from your line sum; edit it to the price you quoted. No per-line price is displayed in the quotation total.",
    };
  }
  return {
    mode,
    singleTotalPrice: current,
    seededFromLines: false,
    note: "Per-line pricing is back. Your line prices are unchanged; the combined price is kept in case you switch back.",
  };
}

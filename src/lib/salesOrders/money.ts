// Fixed-point (integer-cent) money arithmetic for the Sales Orders module.
// All persisted amounts are numeric two-decimal currency values; server-owned
// calculations convert to integer cents, round per the published rules, and
// convert back. Never use raw float arithmetic for totals.

import type { TaxMode } from "../../types/salesOrder.ts";

export const MONEY_SCALE: bigint = BigInt(100);
export const TAX_RATE_LEGACY_PHI = 0.12;

/** Rounds a currency value to integer cents (half away from zero). */
export function toCents(value: number | null): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    throw new Error("A finite money value is required (blank values stay unknown, never zero).");
  }
  if (!Number.isFinite(value)) throw new Error("Non-finite money value.");
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) * 100;
  if (scaled > 9_000_000_000_000_000) throw new Error("Money value exceeds supported range.");
  return sign * Math.floor(scaled + 0.5);
}

export function fromCents(cents: number): number {
  const value = BigInt(cents);
  const whole = value / MONEY_SCALE;
  const fraction = value % MONEY_SCALE;
  return Number(whole.toString()) + Number(fraction.toString()) / 100;
}

/** Rounds to two decimal places (half away from zero for the positive half). */
export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

export interface LineMoneyInput {
  quantity: number | null;
  unitPrice: number | null;
  /** Fixed-amount line discount in currency. */
  discountAmount: number | null;
  taxMode: TaxMode;
  /** Decimal rate, e.g. 0.12 for 12%. */
  taxRate: number | null;
}

export interface LineMoneyResult {
  /** Post-discount taxable/base amount (excludes tax), rounded. */
  baseAmount: number;
  /** Fixed discount amount, rounded and passed through. */
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

/**
 * Computes one line's money according to the tax mode. Quantity and unit
 * price must be present (unknown legacy blanks are never treated as zero).
 * Inclusive mode: payable = qty*price - discount; VAT = payable*rate/(1+rate);
 * base = payable - VAT. Exclusive mode: base = payable; tax = base*rate.
 * Exempt/zero-rated modes carry no tax. Discount may not exceed the gross line
 * amount.
 */
export function computeLineMoney(input: LineMoneyInput): LineMoneyResult {
  if (input.quantity === null || input.quantity === undefined) throw new Error("Quantity is required to compute line money.");
  if (input.unitPrice === null || input.unitPrice === undefined) throw new Error("Unit price is required to compute line money.");
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  if (input.unitPrice < 0) throw new Error("Unit price cannot be negative.");
  const gross = toCents(roundMoney(input.quantity) * roundMoney(input.unitPrice));
  const discountCents = toCents(input.discountAmount ?? 0);
  if (discountCents < 0) throw new Error("Line discount cannot be negative.");
  const payableCents = gross - discountCents;
  if (payableCents < 0) throw new Error("Line discount cannot exceed the line amount.");
  const rate = input.taxRate ?? 0;
  if (rate < 0 || rate > 1) throw new Error("Tax rate must be between 0 and 1.");

  let baseCents: number;
  let taxCents: number;
  switch (input.taxMode) {
    case "VAT_INCLUSIVE":
      taxCents = Math.floor((payableCents * rate) / (1 + rate) + 0.5);
      baseCents = payableCents - taxCents;
      break;
    case "VAT_EXCLUSIVE":
      baseCents = payableCents;
      taxCents = Math.floor(payableCents * rate + 0.5);
      break;
    case "VAT_EXEMPT":
    case "ZERO_RATED":
      baseCents = payableCents;
      taxCents = 0;
      break;
    default:
      throw new Error(`Unsupported tax mode: ${input.taxMode}`);
  }

  return {
    baseAmount: fromCents(baseCents),
    discountAmount: fromCents(discountCents),
    taxAmount: fromCents(taxCents),
    lineTotal: fromCents(baseCents + taxCents),
  };
}

export interface OrderTotals {
  subtotalExTax: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}

/** Sums rounded line amounts into order totals (each in integer cents). */
export function sumOrderTotals(lines: readonly LineMoneyResult[]): OrderTotals {
  let subtotal = BigInt(0);
  let discount = BigInt(0);
  let tax = BigInt(0);
  let total = BigInt(0);
  for (const line of lines) {
    subtotal += BigInt(toCents(line.baseAmount));
    discount += BigInt(toCents(line.discountAmount));
    tax += BigInt(toCents(line.taxAmount));
    total += BigInt(toCents(line.lineTotal));
  }
  const asNumber = (cents: bigint): number => fromCents(Number(cents));
  return {
    subtotalExTax: asNumber(subtotal),
    discountTotal: asNumber(discount),
    taxTotal: asNumber(tax),
    grandTotal: asNumber(total),
  };
}
export interface DiscountSettings {
  mode: "OVERALL" | "PER_ITEM";
  type: "PESO" | "PERCENT";
  value: number;
  basis: "VAT_INCLUSIVE" | "VAT_EXCLUSIVE";
  scope: "FULL_LINE" | "PER_UNIT";
}

export function defaultDiscount(value = 0): DiscountSettings {
  return { mode: "OVERALL", type: "PESO", value, basis: "VAT_INCLUSIVE", scope: "FULL_LINE" };
}

export function parseDiscountJson(value: unknown): DiscountSettings | undefined {
  if (!value) return undefined;
  try { return validateDiscount(typeof value === "string" ? JSON.parse(value) : value); }
  catch { return undefined; }
}

export function validateDiscount(raw: unknown): DiscountSettings {
  if (typeof raw !== "object" || raw === null) throw new Error("Invalid discount settings.");
  const d = raw as Record<string, unknown>;
  const value = Number(d.value ?? 0);
  if (!Number.isFinite(value) || value < 0) throw new Error("Discount must be a non-negative amount.");
  if (d.type !== undefined && !["PESO", "PERCENT"].includes(String(d.type))) throw new Error("Invalid discount type.");
  if (d.mode !== undefined && !["OVERALL", "PER_ITEM"].includes(String(d.mode))) throw new Error("Invalid discount mode.");
  if (d.basis !== undefined && !["VAT_INCLUSIVE", "VAT_EXCLUSIVE"].includes(String(d.basis))) throw new Error("Invalid discount basis.");
  if (d.scope !== undefined && !["FULL_LINE", "PER_UNIT"].includes(String(d.scope))) throw new Error("Invalid discount scope.");
  if (d.type === "PERCENT" && value > 100) throw new Error("Percentage discount cannot exceed 100%.");
  return { mode: d.mode === "PER_ITEM" ? "PER_ITEM" : "OVERALL", type: d.type === "PERCENT" ? "PERCENT" : "PESO", value,
    basis: d.basis === "VAT_EXCLUSIVE" ? "VAT_EXCLUSIVE" : "VAT_INCLUSIVE", scope: d.scope === "PER_UNIT" ? "PER_UNIT" : "FULL_LINE" };
}

export const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Returns the deduction in the same tax basis as the supplied gross amount. */
export function discountAmount(gross: number, settings: DiscountSettings | undefined, quantity = 1, taxMode = "VAT_INCLUSIVE", rate = 0.12): number {
  if (!Number.isFinite(gross) || gross < 0) throw new Error("The amount being discounted must be finite and non-negative.");
  if (!settings) return 0;
  const d = validateDiscount(settings);
  let amount = d.value * (d.scope === "PER_UNIT" && d.type === "PESO" ? quantity : 1);
  if (d.type === "PERCENT") {
    const basis = d.basis === "VAT_EXCLUSIVE" && taxMode === "VAT_INCLUSIVE" ? gross / (1 + rate)
      : d.basis === "VAT_INCLUSIVE" && taxMode === "VAT_EXCLUSIVE" ? gross * (1 + rate) : gross;
    amount = basis * d.value / 100;
  }
  if (amount > gross + 0.005) throw new Error("Discount cannot exceed the amount being discounted.");
  return roundCurrency(amount);
}

/** Allocate integer cents deterministically, keeping the sum exact. */
export function allocateDiscount(amount: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const cents = Math.round(amount * 100);
  const shares = weights.map(w => cents * w / sum);
  const result = shares.map(Math.floor);
  let remaining = cents - result.reduce((a, b) => a + b, 0);
  const order = shares.map((share, index) => ({ index, fraction: share - result[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) { if (remaining-- <= 0) break; result[index]++; }
  return result.map(c => c / 100);
}

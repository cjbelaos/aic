const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" month the PMS cycle is counted from (Contracts column P). */
export function isPmsCycleStart(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

/**
 * Month the PMS cycle counts from: the contract's PMS cycle start when set
 * (the real PMS schedule, e.g. tracked from when AIC started recording),
 * otherwise the agreement start month (the notarized MOA date).
 */
export function pmsCycleAnchor(contract: { startDate: string; pmsCycleStart?: string }): string {
  return isPmsCycleStart(contract.pmsCycleStart) ? contract.pmsCycleStart : (contract.startDate ?? "").slice(0, 7);
}

/** Sheet cell → "YYYY-MM": accepts "2026-08", "2026-08-01" or "8/1/2026" (Sheets may coerce the month to a date). */
export function toPmsCycleStart(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  const iso = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  const us = /^(\d{1,2})\/\d{1,2}\/(\d{4})$/.exec(value);
  const month = iso ? `${iso[1]}-${iso[2]}` : us ? `${us[2]}-${us[1].padStart(2, "0")}` : "";
  return isPmsCycleStart(month) ? month : undefined;
}

function parseInvoiceDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("A valid PMS cycle start and invoice date are required for quarterly billing.");
  }
  return date;
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const toMonth = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/** Three-month quarter (as "YYYY-MM" months) containing the invoice date, counted from the cycle anchor month. */
export function quarterlyBillingPeriod(anchorMonth: string, invoiceDate: string): { start: string; end: string } {
  const anchor = (anchorMonth ?? "").slice(0, 7);
  if (!MONTH_RE.test(anchor)) throw new Error("A valid PMS cycle start and invoice date are required for quarterly billing.");
  parseInvoiceDate(invoiceDate);
  const offset = monthIndex(invoiceDate.slice(0, 7)) - monthIndex(anchor);
  if (offset < 0) throw new Error("The invoice date cannot precede the PMS cycle start.");
  const start = monthIndex(anchor) + Math.floor(offset / 3) * 3;
  return { start: toMonth(start), end: toMonth(start + 2) };
}

const MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/** "2026-11" → "NOVEMBER 2026". */
export function billingMonthLabel(ym: string): string {
  return `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

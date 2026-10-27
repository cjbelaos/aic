import type { Liquidation } from "@/types/liquidation";

export type LiquidationReturnStatus = "NOT_RECORDED" | "RETURNED" | "NOT_APPLICABLE";
export const RETURN_STATUS_LABELS: Record<LiquidationReturnStatus, string> = {
  NOT_RECORDED: "Not yet recorded",
  RETURNED: "Returned",
  NOT_APPLICABLE: "Not applicable",
};

export function getLiquidationReturnAmount(liquidation: Liquidation): number {
  const advance = liquidation.totalAmountRequested || 0;
  const spent = liquidation.totalAmount;
  if (!Number.isFinite(advance) || !Number.isFinite(spent)) return 0;
  return Math.max(0, Math.round((advance - spent) * 100) / 100);
}

export function getLiquidationReturnStatus(liquidation: Liquidation): LiquidationReturnStatus | undefined {
  if (liquidation.status.toUpperCase() !== "APPROVED") return undefined;
  if (getLiquidationReturnAmount(liquidation) <= 0) return "NOT_APPLICABLE";
  return liquidation.returnDate && liquidation.returnEvidenceFileId ? "RETURNED" : "NOT_RECORDED";
}

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function validateReturnDate(value: string, now = new Date()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("A valid return date is required.");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < "1900-01-01") {
    throw new Error("A valid return date is required.");
  }
  if (value > manilaToday(now)) throw new Error("Return date cannot be in the future (Philippine time).");
}

export function assertCanRecordReturn(liquidation: Liquidation, userId: string): void {
  if (liquidation.userId !== userId) throw new Error("Only the requestor can record or edit this return.");
  if (liquidation.status.toUpperCase() !== "APPROVED") throw new Error("Only approved liquidations can have a return recorded.");
  if (getLiquidationReturnAmount(liquidation) <= 0) throw new Error("This liquidation has no amount to return.");
}

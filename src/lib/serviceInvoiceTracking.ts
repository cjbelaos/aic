import type { InvoicePaymentStatus } from "../types/serviceInvoice";

export const PAYMENT_LABELS: Record<InvoicePaymentStatus, string> = { unpaid: "Unpaid", partial: "Partially paid", full: "Fully paid" };
export interface InvoiceTrackingData {
  paymentStatus?: InvoicePaymentStatus;
  paymentHistory?: { status: InvoicePaymentStatus; previousStatus: InvoicePaymentStatus; changedBy: string; changedAt: string }[];
  scannedFileLink?: string;
  scannedAt?: string;
  scannedBy?: string;
  statusReason?: string;
  statusHistory?: { status: string; reason: string; changedBy: string; changedAt: string }[];
  [key: string]: unknown;
}
export function parseInvoiceMetadata(value: unknown): InvoiceTrackingData {
  const raw = String(value ?? "").trim();
  if (raw === "COMPLETED" || raw === "REVERSED") return { status: raw };
  try { const parsed = JSON.parse(raw); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
export function paymentStatusFor(status: string, metadata: { paymentStatus?: InvoicePaymentStatus }): InvoicePaymentStatus {
  // A legacy Paid status remains paid until an admin explicitly reconciles it.
  if (metadata.paymentStatus === "unpaid" || metadata.paymentStatus === "partial" || metadata.paymentStatus === "full") return metadata.paymentStatus;
  return status === "paid" ? "full" : "unpaid";
}
export function validatePaymentStatus(value: unknown): InvoicePaymentStatus {
  if (value !== "unpaid" && value !== "partial" && value !== "full") throw new Error("Invalid payment status.");
  return value;
}
export function assertUnpaid(status: string, metadata: InvoiceTrackingData): void {
  if (paymentStatusFor(status, metadata) !== "unpaid") throw new Error("Resolve recorded payments before cancelling, voiding or deleting this invoice.");
}
export function requireStatusReason(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("A reason is required for cancellation or voiding.");
  return value.trim();
}

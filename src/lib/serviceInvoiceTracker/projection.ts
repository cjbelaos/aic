import { invoiceTotals } from "../serviceInvoiceDiscounts.ts";
import type { ServiceInvoiceItem } from "../../types/serviceInvoice.ts";

/** First invoice number the accounting tracker sync may write. Earlier rows are never touched. */
export const TRACKER_FIRST_INVOICE = 1801;

export type TrackerCell = string | number;
/** Owned tracker columns, in order A,B,C,E,H,J. */
export interface TrackerProjection { a: string; b: string; c: number | ""; e: string; h: string; j: number | "" }
export interface ProjectionInput {
  invoiceNo: string;
  status: string;
  /** YYYY-MM-DD */
  date: string;
  contractId?: string;
  poNo?: string;
  companyName: string;
  items: readonly ServiceInvoiceItem[];
  discountAmount?: number;
  /** Present only when the invoice is linked to a Sales Order. */
  salesOrderLines?: readonly { lineNo: number; description: string; lineStatus: string }[];
}

const CANCELLED_STATUSES = new Set(["cancelled", "void", "deleted"]);

export function normalizeInvoiceNo(value: unknown): string {
  return String(value ?? "").trim().replace(/^0+(?=\d)/, "");
}

export function isInScope(invoiceNo: string, status: string): boolean {
  if (status === "draft" || !/^\d+$/.test(String(invoiceNo).trim())) return false;
  return Number(invoiceNo) >= TRACKER_FIRST_INVOICE;
}

export function toDateSerial(isoDate: string): number {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error(`Invalid invoice date "${isoDate}".`);
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

export function describeInvoice(input: ProjectionInput): string {
  const lines = input.salesOrderLines
    ? [...input.salesOrderLines].filter(line => line.lineStatus === "ACTIVE").sort((x, y) => x.lineNo - y.lineNo).map(line => line.description)
    : input.items.filter(item => !item.notation).map(item => item.description);
  return lines.map(line => String(line ?? "").trim()).filter(Boolean).join("\n");
}

export function projectTrackerRow(input: ProjectionInput): TrackerProjection {
  const cancelled = CANCELLED_STATUSES.has(input.status);
  return {
    a: cancelled ? "" : input.contractId ? "Contracted" : "Service",
    b: cancelled ? "CANCELLED" : String(input.poNo ?? "").trim(),
    c: toDateSerial(input.date),
    e: input.companyName,
    h: describeInvoice(input),
    j: cancelled ? "" : invoiceTotals({ items: input.items, discountAmount: input.discountAmount }).grandTotal,
  };
}

export function projectionToCells(p: TrackerProjection): TrackerCell[] {
  return [p.a, p.b, p.c, p.e, p.h, p.j];
}

const cellText = (value: unknown) => value == null ? "" : String(value);

/** `current` holds the row's [A,B,C,E,H,J]. Writable when untouched or exactly what the app last wrote. */
export function isRowWritable(current: readonly unknown[], lastWritten?: readonly TrackerCell[]): boolean {
  const cells = [0, 1, 2, 3, 4, 5].map(index => cellText(current[index]));
  if (cells.every(cell => cell === "")) return true;
  return !!lastWritten && cells.every((cell, index) => cell === cellText(lastWritten[index]));
}

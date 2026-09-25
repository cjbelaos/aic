/**
 * Quotations tab column contract — the sheet has exactly 21 columns, A..U:
 *
 *   A QuotationNo        B CustomerId          C Customer
 *   D Description        E Amount              F Discount
 *   G ShippingFee        H PricingMode         I SingleTotalPrice
 *   J PaymentTermId      K PaymentTerms        L File
 *   M Date               N PreparedBy          O ApprovedBy
 *   P SentBy             Q Status
 *   R CreatedBy          S CreatedAt           T UpdatedBy   U UpdatedAt
 *
 * H and I are blank on historical quotations. A blank PricingMode is PER_LINE and
 * no SingleTotalPrice is ever inferred for such a row: its stored Amount,
 * Discount and ShippingFee are read back exactly as written.
 *
 * Pure module (no React, no Google, no node APIs) so the Sheets layer, the PDF
 * route and the focused tests share one definition of the layout.
 */

import type { QuotationPricingMode } from "../types/quotation.ts";
import { asMoney, normalizeQuotationPricingMode } from "./quotationPricing.ts";

export const QUOTATION_SHEET_NAME = "Quotations";

/** Exactly 21 columns (A..U) are written and read for every quotation. */
export const QUOTATION_ROW_COLUMN_COUNT = 21;

/** Zero-based index of every Quotations column. */
export const QUOTATION_ROW = {
  quotationNo: 0,
  customerId: 1,
  customer: 2,
  description: 3,
  amount: 4,
  discount: 5,
  shippingFee: 6,
  pricingMode: 7,
  singleTotalPrice: 8,
  paymentTermId: 9,
  paymentTerms: 10,
  file: 11,
  date: 12,
  preparedBy: 13,
  approvedBy: 14,
  sentBy: 15,
  status: 16,
  createdBy: 17,
  createdAt: 18,
  updatedBy: 19,
  updatedAt: 20,
} as const;

export type QuotationColumnKey = keyof typeof QUOTATION_ROW;

export interface ParsedQuotationRowValues {
  quotationNo: string;
  customerId: string;
  customer: string;
  description: string;
  amount: number;
  discount: number;
  shippingFee: number;
  pricingMode: QuotationPricingMode;
  singleTotalPrice: number;
  paymentTermId: string;
  paymentTerms: string;
  file: string;
  date: string;
  preparedBy: string;
  approvedBy: string;
  sentBy: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

function cellText(row: readonly unknown[], index: number): string {
  return String(row[index] ?? "");
}

function cellNumber(row: readonly unknown[], index: number): number {
  const raw = row[index];
  if (raw === undefined || raw === null || raw === "") return 0;
  const value = Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reads a stored row using the A..U layout. Short or blank cells are safe: a
 * blank PricingMode (H) is PER_LINE and no SingleTotalPrice is inferred, so a
 * historical row's Amount, Discount and ShippingFee are returned unchanged.
 */
export function parseQuotationRowValues(row: readonly unknown[]): ParsedQuotationRowValues {
  return {
    quotationNo: cellText(row, QUOTATION_ROW.quotationNo).trim(),
    customerId: cellText(row, QUOTATION_ROW.customerId),
    customer: cellText(row, QUOTATION_ROW.customer),
    description: cellText(row, QUOTATION_ROW.description),
    amount: cellNumber(row, QUOTATION_ROW.amount),
    discount: cellNumber(row, QUOTATION_ROW.discount),
    shippingFee: cellNumber(row, QUOTATION_ROW.shippingFee),
    pricingMode: normalizeQuotationPricingMode(row[QUOTATION_ROW.pricingMode]),
    singleTotalPrice: asMoney(row[QUOTATION_ROW.singleTotalPrice]),
    paymentTermId: cellText(row, QUOTATION_ROW.paymentTermId),
    paymentTerms: cellText(row, QUOTATION_ROW.paymentTerms),
    file: cellText(row, QUOTATION_ROW.file),
    date: cellText(row, QUOTATION_ROW.date),
    preparedBy: cellText(row, QUOTATION_ROW.preparedBy),
    approvedBy: cellText(row, QUOTATION_ROW.approvedBy),
    sentBy: cellText(row, QUOTATION_ROW.sentBy),
    status: cellText(row, QUOTATION_ROW.status).trim() || "DRAFT",
    createdBy: cellText(row, QUOTATION_ROW.createdBy),
    createdAt: cellText(row, QUOTATION_ROW.createdAt),
    updatedBy: cellText(row, QUOTATION_ROW.updatedBy),
    updatedAt: cellText(row, QUOTATION_ROW.updatedAt),
  };
}

/** The H/I pricing pair of a stored row (blank H reads as PER_LINE, blank I as 0). */
export function parseQuotationPricingCells(row: readonly unknown[]): [QuotationPricingMode, number] {
  return [
    normalizeQuotationPricingMode(row[QUOTATION_ROW.pricingMode]),
    asMoney(row[QUOTATION_ROW.singleTotalPrice]),
  ];
}

/** The H/I pair to write (blank/unknown mode falls back to PER_LINE, no price). */
export function quotationPricingCells(mode: unknown, singleTotalPrice: unknown): [QuotationPricingMode, number] {
  return [normalizeQuotationPricingMode(mode), asMoney(singleTotalPrice)];
}

export interface QuotationAuditCells {
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/**
 * Audit cells (R..U) for a write. Creation identity/timestamp are preserved from
 * the existing row when present; the update pair always records the writer.
 */
export function quotationAuditCells(actor: string, timestamp: string, existingRow?: readonly unknown[]): QuotationAuditCells {
  if (!existingRow) {
    return { createdBy: actor, createdAt: timestamp, updatedBy: actor, updatedAt: timestamp };
  }
  const existing = parseQuotationRowValues(existingRow);
  return {
    createdBy: existing.createdBy || actor,
    createdAt: existing.createdAt || timestamp,
    updatedBy: actor,
    updatedAt: timestamp,
  };
}

export interface QuotationRowWriteInput extends Partial<QuotationAuditCells> {
  quotationNo?: string | null;
  customerId?: string | null;
  customer?: string | null;
  description?: string | null;
  amount?: number | null;
  discount?: number | null;
  shippingFee?: number | null;
  /** Already resolved pricing pair (see quotationPricingCells). */
  pricingMode?: unknown;
  singleTotalPrice?: unknown;
  paymentTermId?: string | null;
  paymentTerms?: string | null;
  file?: string | null;
  date?: string | null;
  preparedBy?: string | null;
  approvedBy?: string | null;
  sentBy?: string | null;
  status?: string | null;
}

/** Builds the 21-cell row in the exact A..U order the sheet uses. */
export function quotationRowValues(input: QuotationRowWriteInput): Array<string | number> {
  return [
    input.quotationNo ?? "",
    input.customerId ?? "",
    input.customer ?? "",
    input.description ?? "",
    input.amount ?? 0,
    input.discount ?? 0,
    input.shippingFee ?? 0,
    normalizeQuotationPricingMode(input.pricingMode),
    asMoney(input.singleTotalPrice),
    input.paymentTermId ?? "",
    input.paymentTerms ?? "",
    input.file ?? "",
    input.date ?? "",
    input.preparedBy ?? "",
    input.approvedBy ?? "",
    input.sentBy ?? "",
    input.status || "DRAFT",
    input.createdBy ?? "",
    input.createdAt ?? "",
    input.updatedBy ?? "",
    input.updatedAt ?? "",
  ];
}

/** Header labels in sheet order, index-aligned with QUOTATION_ROW. */
export const QUOTATION_ROW_HEADERS: readonly string[] = [
  "QuotationNo", "CustomerId", "Customer", "Description", "Amount", "Discount",
  "ShippingFee", "PricingMode", "SingleTotalPrice", "PaymentTermId", "PaymentTerms",
  "File", "Date", "PreparedBy", "ApprovedBy", "SentBy", "Status", "CreatedBy",
  "CreatedAt", "UpdatedBy", "UpdatedAt",
];

/** A1 column letter for a zero-based index (0 → A, 20 → U, 26 → AA). */
export function columnLetter(index: number): string {
  let remaining = Math.max(0, Math.floor(index));
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (remaining % 26)) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letters;
}

/** The full row range read and appended for quotations. */
export function quotationSheetRange(sheetName = QUOTATION_SHEET_NAME): string {
  return `${sheetName}!A2:${columnLetter(QUOTATION_ROW_COLUMN_COUNT - 1)}`;
}

/** A1 range for one cell of a quotation row (rowNumber is 1-based, as in Sheets). */
export function quotationCellRange(rowNumber: number, key: QuotationColumnKey, sheetName = QUOTATION_SHEET_NAME): string {
  return `${sheetName}!${columnLetter(QUOTATION_ROW[key])}${rowNumber}`;
}

/** A1 range spanning consecutive columns of one quotation row. */
export function quotationCellSpanRange(rowNumber: number, firstKey: QuotationColumnKey, lastKey: QuotationColumnKey, sheetName = QUOTATION_SHEET_NAME): string {
  const first = QUOTATION_ROW[firstKey];
  const last = QUOTATION_ROW[lastKey];
  const start = columnLetter(Math.min(first, last));
  const end = columnLetter(Math.max(first, last));
  return `${sheetName}!${start}${rowNumber}:${end}${rowNumber}`;
}

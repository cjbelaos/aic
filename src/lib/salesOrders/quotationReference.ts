/**
 * Sales Order quotation reference — one reference per order, chosen in one of
 * two modes:
 *
 *  - INTERNAL: the current, default flow. The user selects a quotation that
 *    already exists in the Quotations module. The order keeps the quotation
 *    number, so the create-from-quotation relationship and its duplicate guard
 *    are preserved exactly.
 *  - EXTERNAL: the user types a quotation number that has no internal record
 *    (for example a customer- or supplier-issued quotation). The typed value is
 *    stored with the order; no internal quotation record or ID is required.
 *
 * Persistence reuses the existing `QuotationNo` column. The two modes are
 * mutually exclusive, so the column always holds exactly one reference — the
 * same approach `deliveryReference.ts` uses for its display reference. No schema
 * change or migration is required, and payloads that omit `quotationSource`
 * (every existing caller) keep their previous behaviour byte-for-byte.
 *
 * Pure module: imported by the form, the API validation, the server service and
 * the focused Node tests. Never import Google, React or node-only APIs here.
 */

export type SalesOrderQuotationSource = "INTERNAL" | "EXTERNAL";

export const SALES_ORDER_QUOTATION_SOURCES: readonly SalesOrderQuotationSource[] = [
  "INTERNAL",
  "EXTERNAL",
];

/** Exact button labels for switching the quotation reference mode. */
export const INPUT_EXTERNAL_QUOTATION_LABEL = "Input External Quotation Number";
export const SELECT_EXISTING_QUOTATION_LABEL = "Select Existing Quotation";

/** Field labels for the two modes. */
export const INTERNAL_QUOTATION_FIELD_LABEL = "Quotation Number";
export const EXTERNAL_QUOTATION_FIELD_LABEL = "External Quotation Number";

export const EXTERNAL_QUOTATION_REQUIRED_ERROR =
  "Enter an external quotation number, or switch back to selecting an existing quotation.";

export function isSalesOrderQuotationSource(value: unknown): value is SalesOrderQuotationSource {
  return value === "INTERNAL" || value === "EXTERNAL";
}

/** Trimmed external quotation reference. The reference format is not constrained. */
export function normalizeExternalQuotationNo(value: unknown): string {
  return String(value ?? "").trim();
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export interface SalesOrderQuotationInput {
  /** Explicit mode. Omit for legacy payloads that predate external quotations. */
  quotationSource?: SalesOrderQuotationSource | string | null;
  /** Selected internal quotation number. */
  quotationNo?: string | null;
  /** Manually entered external quotation number. */
  externalQuotationNo?: string | null;
}

export interface SalesOrderQuotationResolution {
  /** Explicit mode when the caller supplied one, otherwise null. */
  source: SalesOrderQuotationSource | null;
  /** Value persisted in the SalesOrders `QuotationNo` column ("" when absent). */
  quotationNo: string;
  /** Present only when an explicit mode was invalid for the supplied value. */
  error?: string;
}

/**
 * Resolves the quotation reference the caller supplied. The two modes are
 * mutually exclusive: an external number clears the internal selection and vice
 * versa. An external number must be non-empty before submission; a blank
 * internal selection stays optional so a quotation-free order can still be
 * created. Payloads without an explicit mode pass through unchanged.
 */
export function resolveSalesOrderQuotation(
  input: SalesOrderQuotationInput = {},
): SalesOrderQuotationResolution {
  const quotationNo = text(input.quotationNo);
  const externalQuotationNo = normalizeExternalQuotationNo(input.externalQuotationNo);
  if (!isSalesOrderQuotationSource(input.quotationSource)) {
    return { source: null, quotationNo };
  }
  if (input.quotationSource === "EXTERNAL") {
    if (!externalQuotationNo) {
      return { source: "EXTERNAL", quotationNo: "", error: EXTERNAL_QUOTATION_REQUIRED_ERROR };
    }
    return { source: "EXTERNAL", quotationNo: externalQuotationNo };
  }
  return { source: "INTERNAL", quotationNo };
}

/** Reference shown on the detail page and in lists ("" when absent). */
export function salesOrderQuotationDisplay(record: { quotationNo?: string | null }): string {
  return text(record.quotationNo);
}

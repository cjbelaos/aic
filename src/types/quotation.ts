export type QuotationStatus = "DRAFT" | "SAVED" | "SENT";

/**
 * How the quotation is priced.
 *  - PER_LINE: every line carries its own quantity and unit price (historical).
 *  - SINGLE_TOTAL: all lines are descriptive and one combined price is quoted at
 *    quotation level. No per-line price is derived from that total.
 */
export type QuotationPricingMode = "PER_LINE" | "SINGLE_TOTAL";

/**
 * A line is a catalog PRODUCT when it references a product record and a SERVICE
 * (service or repair work) when it only carries a manually entered description.
 */
export type QuotationLineKind = "PRODUCT" | "SERVICE";

export interface QuotationAudit {
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Quotation extends QuotationAudit {
  id: string;
  quotationNo: string;
  customer: string;
  customerId?: string;
  paymentTermId?: string;
  description: string;
  items: QuotationDetail[];
  notation: QuotationNotation[];
  amount: number;
  file: string;
  date: string;
  terms: string;
  delivery: string;
  warranty: string;
  discount: number;
  shippingFee?: number;
  preparedBy: string;
  approvedBy: string;
  sentBy: string;
  status: QuotationStatus;
  /**
   * Pricing mode. Absent (historical records and older callers) means PER_LINE,
   * which is exactly the original behaviour.
   */
  pricingMode?: QuotationPricingMode;
  /**
   * The one combined price entered in SINGLE_TOTAL mode, before the quotation
   * discount and shipping fee. Ignored in PER_LINE mode.
   */
  singleTotalPrice?: number;
}

export interface QuotationDetail extends QuotationAudit {
  quotationNo: string;
  /** Stable Products reference when this is a catalog item. */
  productId?: string;
  customerId?: string;
  productCodeSnapshot?: string;
  description: string;
  quantity: number;
  unit: string;
  /**
   * Line price. In SINGLE_TOTAL mode this is whatever the user typed while the
   * line was priced; it is kept so switching modes never loses data but it is
   * never displayed and never divided from the combined total.
   */
  unitPrice: number;
}

export interface QuotationNotation extends QuotationAudit {
  quotationNo: string;
  notation: string;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 */
export type CreateQuotationPayload = Omit<Quotation, "id">;

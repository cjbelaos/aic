export type QuotationStatus = "DRAFT" | "SAVED" | "SENT";

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

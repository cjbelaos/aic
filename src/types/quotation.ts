export type QuotationStatus = "DRAFT" | "SENT";

export interface Quotation {
  id: string;
  quotationNo: string;
  customer: string;
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
  preparedBy: string;
  approvedBy: string;
  sentBy: string;
  status: QuotationStatus;
}

export interface QuotationDetail {
  quotationNo: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface QuotationNotation {
  quotationNo: string;
  notation: string;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 */
export type CreateQuotationPayload = Omit<Quotation, "id">;

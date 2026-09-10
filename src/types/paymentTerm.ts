export type PaymentTermStatus = "Active" | "Inactive";

export interface PaymentTerm {
  paymentTermId: string;
  code: string;
  name: string;
  description: string;
  dueDays?: number;
  downPaymentPercent?: number;
  balanceTerms: string;
  status: PaymentTermStatus;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export type CreatePaymentTermPayload = Omit<PaymentTerm, "paymentTermId" | "createdBy" | "createdAt" | "updatedBy" | "updatedAt">;
export type UpdatePaymentTermPayload = Pick<PaymentTerm, "paymentTermId"> & Partial<CreatePaymentTermPayload>;

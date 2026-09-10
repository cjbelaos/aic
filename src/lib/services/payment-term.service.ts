import axios from "axios";
import type { CreatePaymentTermPayload, PaymentTerm, UpdatePaymentTermPayload } from "@/types/paymentTerm";
const BASE = "/api/payment-terms";
const paymentTermService = { getAll: async () => (await axios.get<PaymentTerm[]>(BASE)).data, create: async (payload: CreatePaymentTermPayload) => (await axios.post<PaymentTerm>(BASE, payload)).data, update: async (payload: UpdatePaymentTermPayload) => (await axios.put<PaymentTerm>(`${BASE}/${payload.paymentTermId}`, payload)).data };
export default paymentTermService;

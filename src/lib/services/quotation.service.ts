import type { QuotationRecipients } from "@/lib/quotationRecipients";
import type { DiscountSettings } from "@/lib/discounts";
// src/lib/services/quotation.service.ts
import axios from "axios";
import {
  Quotation,
  QuotationDetail,
  QuotationNotation,
  CreateQuotationPayload,
} from "@/types/quotation";
import { Company } from "@/types/company";
import type { QuotationHistoryEntry } from "@/types/quotation-history";

/** Customer snapshot used by the quotation editor/template. Extends Company with contact details from CompanyContacts. */
export interface QuotationCustomer extends Company {
  contactPerson?: string;
  email?: string;
}

const API_BASE_URL = "/api/quotations";

// Matches what the save-and-email API endpoint expects
export interface SaveAndEmailPayload {
  customer?: Company;
  quotationDescription: string;
  items: QuotationDetail[];
  terms: string;
  delivery: string;
  warranty: string;
  preparedBy: string;
  discount: number;
  discountSettings?: DiscountSettings;
  shippingFee?: number;
  paymentTermId?: string;
  quotationNo: string;
  dateIssued: string;
  validUntil: string;
  notations?: QuotationNotation[];
  subTotal: number;
  vatableAmount: number;
  vat: number;
  grandTotal: number;
  status: "DRAFT" | "SAVED" | "SENT";
}

export interface SaveAndEmailResponse {
  success: boolean;
  message: string;
  data?: any;
}

// Updated: Separate payload for saving only (no email)
export interface SaveQuotationPayload {
  customer?: Company;
  quotationDescription: string;
  items: QuotationDetail[];
  terms: string;
  delivery: string;
  warranty: string;
  preparedBy: string;
  approvedBy?: string;
  discount: number;
  discountSettings?: DiscountSettings;
  shippingFee?: number;
  paymentTermId?: string;
  quotationNo: string;
  dateIssued: string;
  validUntil: string;
  notations?: QuotationNotation[];
  subTotal: number;
  vatableAmount: number;
  vat: number;
  grandTotal: number;
  status: "DRAFT" | "SAVED" | "SENT";
  /**
   * Pricing mode chosen in the editor (PER_LINE keeps the historical behaviour).
   * Omitted callers keep whatever the stored row already holds.
   */
  pricingMode?: "PER_LINE" | "SINGLE_TOTAL";
  /** One combined price for the whole job (SINGLE_TOTAL mode only). */
  singleTotalPrice?: number;
}

// New: Payload for sending email separately
export interface SendEmailPayload {
  sendId?: string;
  snapshotToken: string;
  quotationNo: string;
  customer: string;
  email: string;
  cc: string[];
  quotationDescription: string;
  grandTotal: number;
  pdfBlob: Blob;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

// Keep an interrupted attempt's identity until the server acknowledges delivery.
const sendAttempts = new Map<string, { sendId: string; quotationNo: string; recipient: string; snapshotToken: string }>();

const quotationService = {
  getRecipients: async (quotationNo: string): Promise<QuotationRecipients> => {
    const response = await axios.get<QuotationRecipients>(`${API_BASE_URL}/${encodeURIComponent(quotationNo)}/recipients`);
    return response.data;
  },
  recoverPendingSend: async (quotationNo: string): Promise<ApiResponse | null> => {
    const attempts = [...sendAttempts.entries()].filter(([, attempt]) => attempt.quotationNo === quotationNo.trim());
    if (!attempts.length) return null;
    const response = await axios.get<QuotationHistoryEntry[]>(`${API_BASE_URL}/${encodeURIComponent(quotationNo.trim())}/history`);
    for (const [key, attempt] of attempts) {
      const receipt = response.data.find(entry => entry.sendId === attempt.sendId);
      if (!receipt) continue;
      if (receipt.state === "SENT") {
        sendAttempts.delete(key);
        return { success: true, message: "The previous send was confirmed. No additional email was sent.", data: { revision: receipt.revision, fileLink: receipt.file, sendId: receipt.sendId, recovered: true } };
      }
      if (receipt.state === "SENDING" || receipt.state === "UNCERTAIN") throw new Error("A previous delivery is in progress or uncertain. Confirm its delivery and reconcile the history before sending again.");
    }
    return null;
  },
  getHistory: async (quotationNo: string): Promise<QuotationHistoryEntry[]> => {
    const response = await axios.get<QuotationHistoryEntry[]>(`${API_BASE_URL}/${encodeURIComponent(quotationNo)}/history`);
    return response.data;
  },
  savePdfToDrive: async (quotationNo: string, pdfBase64: string, snapshotToken: string): Promise<{ fileLink: string }> => {
    const response = await axios.post<{ fileLink: string }>(`${API_BASE_URL}/save-pdf`, { quotationNo, pdfBase64, snapshotToken });
    return response.data;
  },
  // Uses GET /api/quotations
  getAll: async (): Promise<Quotation[]> => {
    try {
      const response = await axios.get<Quotation[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch quotations:", error);
      throw error;
    }
  },

  // Uses GET /api/quotations/:refNo
  getByRefNo: async (refNo: string): Promise<Quotation | null> => {
    try {
      const response = await axios.get<Quotation>(
        `${API_BASE_URL}/${encodeURIComponent(refNo)}`,
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch quotation ${refNo}:`, error);
      return null;
    }
  },

  // Uses PUT /api/quotations/:refNo
  updateByRefNo: async (
    refNo: string,
    payload: CreateQuotationPayload,
  ): Promise<Quotation | null> => {
    try {
      const response = await axios.put<Quotation>(
        `${API_BASE_URL}/${encodeURIComponent(refNo)}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to update quotation ${refNo}:`, error);
      throw error;
    }
  },

  updateStatusOnly: async (
    refNo: string,
    status: "DRAFT" | "SAVED" | "SENT",
  ): Promise<Quotation | null> => {
    try {
      const response = await axios.put<Quotation>(
        `${API_BASE_URL}/${encodeURIComponent(refNo)}/status`,
        { status },
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to update status for quotation ${refNo}:`, error);
      throw error;
    }
  },

  // Uses DELETE /api/quotations/:refNo
  deleteByRefNo: async (refNo: string): Promise<boolean> => {
    try {
      const response = await axios.delete<{ success: boolean }>(
        `${API_BASE_URL}/${encodeURIComponent(refNo)}`,
      );
      return response.data.success;
    } catch (error) {
      console.error(`Failed to delete quotation ${refNo}:`, error);
      throw error;
    }
  },

  // Uses POST /api/quotations (basic create)
  create: async (
    payload: CreateQuotationPayload,
  ): Promise<Quotation | null> => {
    try {
      const response = await axios.post<Quotation>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create quotation:", error);
      throw error;
    }
  },

  // NEW: Save quotation to sheets with optional PDF upload (via multipart)
  saveQuotation: async (
    payload: SaveQuotationPayload,
    pdfBlob?: Blob,
  ): Promise<ApiResponse> => {
    try {
      // If we have a PDF blob and status is SENT, send as multipart
      if (pdfBlob && payload.status === "SENT") {
        const formData = new FormData();
        formData.append("payload", JSON.stringify(payload));
        formData.append(
          "file",
          pdfBlob,
          `Quotation - ${payload.quotationDescription}.pdf`,
        );

        const response = await axios.post<ApiResponse>(
          `${API_BASE_URL}/save`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
          },
        );
        return response.data;
      }

      // Otherwise send as JSON (no PDF)
      const response = await axios.post<ApiResponse>(
        `${API_BASE_URL}/save`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to save quotation:", error);
      throw error;
    }
  },

  // NEW: Send email only (quotation already saved)
  sendEmail: async (payload: SendEmailPayload): Promise<ApiResponse> => {
    const recovered = await quotationService.recoverPendingSend(payload.quotationNo);
    if (recovered) return recovered;
    const attemptKey = JSON.stringify([payload.quotationNo, payload.snapshotToken, payload.email, payload.cc]);
    const sendId = payload.sendId || sendAttempts.get(attemptKey)?.sendId || crypto.randomUUID();
    sendAttempts.set(attemptKey, { sendId, quotationNo: payload.quotationNo.trim(), recipient: payload.email, snapshotToken: payload.snapshotToken });
    try {
      const formData = new FormData();
      formData.append("sendId", sendId);
      formData.append("snapshotToken", payload.snapshotToken);
      formData.append("quotationNo", payload.quotationNo);
      formData.append("customer", payload.customer);
      formData.append("email", payload.email);
      formData.append("cc", JSON.stringify(payload.cc));
      formData.append("quotationDescription", payload.quotationDescription);
      formData.append("grandTotal", String(payload.grandTotal));
      formData.append(
        "file",
        payload.pdfBlob,
        `Quotation - ${payload.quotationDescription}.pdf`,
      );

      const response = await axios.post<ApiResponse>(
        `${API_BASE_URL}/send-email`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      if (response.data.success) sendAttempts.delete(attemptKey);
      return response.data;
    } catch (error) {
      console.error("Failed to send email:", error);
      throw error;
    }
  },

  // Uses POST /api/quotations/save-and-email (full workflow with PDF)
  saveAndEmail: async (
    payload: SaveAndEmailPayload,
    pdfBlob?: Blob,
  ): Promise<SaveAndEmailResponse> => {
    try {
      // If we have a PDF blob, send as multipart formdata
      if (pdfBlob) {
        const formData = new FormData();
        formData.append("payload", JSON.stringify(payload));
        formData.append(
          "file",
          pdfBlob,
          `Quotation - ${payload.quotationDescription}.pdf`,
        );

        const response = await axios.post<SaveAndEmailResponse>(
          `${API_BASE_URL}/save-and-email`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
          },
        );
        return response.data;
      }

      // Fallback to JSON (for backward compatibility)
      const response = await axios.post<SaveAndEmailResponse>(
        `${API_BASE_URL}/save-and-email`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to execute Save & Email workflow:", error);
      throw error;
    }
  },

  // Generate a sequential quotation number
  generateQuotationNumber: async (): Promise<string> => {
    try {
      const response = await axios.get<{ refNo: string }>(
        `${API_BASE_URL}/generate-number`,
      );
      return response.data.refNo;
    } catch (error) {
      console.error("Failed to generate quotation number:", error);
      throw error;
    }
  },
};

export default quotationService;

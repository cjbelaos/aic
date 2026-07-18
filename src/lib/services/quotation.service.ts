// src/lib/services/quotation.service.ts
import axios from "axios";
import {
  Quotation,
  QuotationDetail,
  QuotationNotation,
  CreateQuotationPayload,
} from "@/types/quotation";
import { Customer } from "@/types/customer";

const API_BASE_URL = "/api/quotations";

// Matches what the save-and-email API endpoint expects
export interface SaveAndEmailPayload {
  customer?: Customer;
  quotationDescription: string;
  items: QuotationDetail[];
  terms: string;
  delivery: string;
  warranty: string;
  preparedBy: string;
  discount: number;
  quotationNo: string;
  dateIssued: string;
  validUntil: string;
  notations?: QuotationNotation[];
  subTotal: number;
  vatableAmount: number;
  vat: number;
  grandTotal: number;
  status: "DRAFT" | "SENT";
}

export interface SaveAndEmailResponse {
  success: boolean;
  message: string;
  data?: any;
}

// Updated: Separate payload for saving only (no email)
export interface SaveQuotationPayload {
  customer?: Customer;
  quotationDescription: string;
  items: QuotationDetail[];
  terms: string;
  delivery: string;
  warranty: string;
  preparedBy: string;
  discount: number;
  quotationNo: string;
  dateIssued: string;
  validUntil: string;
  notations?: QuotationNotation[];
  subTotal: number;
  vatableAmount: number;
  vat: number;
  grandTotal: number;
  status: "DRAFT" | "SENT";
}

// New: Payload for sending email separately
export interface SendEmailPayload {
  quotationNo: string;
  customer: string;
  email: string;
  quotationDescription: string;
  grandTotal: number;
  pdfBlob: Blob;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

const quotationService = {
  // Uses GET /api/quotations
  getAll: async (): Promise<Quotation[]> => {
    try {
      const response = await axios.get<Quotation[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch quotations:", error);
      return [];
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
    status: "DRAFT" | "SENT",
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
    try {
      const formData = new FormData();
      formData.append("quotationNo", payload.quotationNo);
      formData.append("customer", payload.customer);
      formData.append("email", payload.email);
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

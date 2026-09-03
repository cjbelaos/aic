import axios from "axios";
import {
  CreateServiceInvoicePayload,
  ServiceInvoiceResponse,
  ServiceInvoiceSummary,
} from "@/types/serviceInvoice";
import type { UpdateServiceInvoicePayload } from "@/lib/serviceInvoiceSheets";

const API_BASE_URL = "/api/service-invoices";

const serviceInvoiceService = {
  getAll: async (): Promise<ServiceInvoiceSummary[]> => {
    try {
      const response = await axios.get<ServiceInvoiceSummary[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch service invoices in service layer:",
        error,
      );
      return [];
    }
  },

  createAndPopulateSheet: async (
    payload: CreateServiceInvoicePayload,
  ): Promise<ServiceInvoiceResponse> => {
    try {
      const response = await axios.post<ServiceInvoiceResponse>(
        API_BASE_URL,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        "Failed to create service invoice in service layer:",
        error,
      );
      throw error;
    }
  },

  update: async (
    invoiceNo: string,
    payload: UpdateServiceInvoicePayload,
  ): Promise<ServiceInvoiceSummary> => {
    try {
      const response = await axios.put<ServiceInvoiceSummary>(
        `${API_BASE_URL}/${encodeURIComponent(invoiceNo)}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to update service invoice:", error);
      throw error;
    }
  },

  getPreview: async (invoiceNo: string): Promise<ServiceInvoiceResponse> => {
    try {
      const response = await axios.get<ServiceInvoiceResponse>(
        `${API_BASE_URL}/${encodeURIComponent(invoiceNo)}`,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to fetch service invoice preview:", error);
      throw error;
    }
  },

  delete: async (invoiceNo: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${encodeURIComponent(invoiceNo)}`);
    } catch (error) {
      console.error("Failed to delete service invoice:", error);
      throw error;
    }
  },

  savePdfToDrive: async (
    invoiceNo: string,
    companyName: string,
    date: string,
  ): Promise<{ fileLink: string; fileName: string }> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/save-pdf`, {
        invoiceNo,
        companyName,
        date,
      });
      return response.data;
    } catch (error) {
      console.error("Failed to save Service Invoice PDF to Drive:", error);
      throw error;
    }
  },

  /**
   * Uploads a scanned Service Invoice (image or PDF) for a specific invoice
   * number. The file is stored in Google Drive and its link is persisted in
   * the ServiceInvoices sheet (column J).
   */
  uploadScanned: async (
    invoiceNo: string,
    file: File,
  ): Promise<{ fileLink: string; fileName: string }> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${API_BASE_URL}/upload-scanned`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    } catch (error) {
      console.error("Failed to upload scanned Service Invoice:", error);
      throw error;
    }
  },

  /**
   * TEST ONLY: Duplicates items to fill all 19 rows for testing PDF layout.
   * This method is for development/testing purposes only and should be removed in production.
   */
  testDuplicateItems: async (
    invoiceNo: string,
  ): Promise<{ pdfBase64: string; printUrl: string }> => {
    try {
      const response = await axios.post<{
        success: boolean;
        invoiceNo: string;
        pdfBase64: string;
        printUrl: string;
      }>(`${API_BASE_URL}/test-duplicate-items`, { invoiceNo });
      return {
        pdfBase64: response.data.pdfBase64 || "",
        printUrl: response.data.printUrl || "",
      };
    } catch (error) {
      console.error("Failed to test duplicate items:", error);
      throw error;
    }
  },
};

export default serviceInvoiceService;

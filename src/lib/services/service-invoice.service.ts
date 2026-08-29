import axios from "axios";
import {
  CreateServiceInvoicePayload,
  ServiceInvoiceResponse,
  ServiceInvoiceSummary,
} from "@/types/serviceInvoice";
import { UpdateServiceInvoicePayload } from "@/lib/serviceInvoiceSheets";

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

  getPreview: async (
    invoiceNo: string,
  ): Promise<ServiceInvoiceResponse> => {
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
};

export default serviceInvoiceService;
import api from "@/lib/apiClient";
import type {
  ServiceReport,
  ServiceReportHistoryEvent,
  ServiceInvoiceCoarseRow,
  ServiceReportCustomerOption,
  ServiceReportUserOption,
  ServiceReportType,
  WaterTreatmentServiceReportDetails,
} from "@/types/serviceReport";

export interface ReportDetailResponse {
  success: boolean;
  report: ServiceReport;
  invoice: ServiceInvoiceCoarseRow | null;
  history: ServiceReportHistoryEvent[];
  allowedActions: {
    edit: boolean;
    ready: boolean;
    acknowledge: boolean;
    retryPdf: boolean;
    void: boolean;
  };
  isAdmin: boolean;
  /** Present only for WATER_TREATMENT reports; null otherwise. */
  waterTreatmentDetails: WaterTreatmentServiceReportDetails | null;
}

export interface ReportListRow {
  report: ServiceReport;
  invoice: ServiceInvoiceCoarseRow | null;
}

export interface ReportOptionsResponse {
  success: boolean;
  invoices: ServiceInvoiceCoarseRow[];
  users: ServiceReportUserOption[];
  customers: ServiceReportCustomerOption[];
}

export interface GeneralDraftInput {
  expectedVersion: number;
  serviceDate: string;
  serviceType: string;
  fieldReport: string;
  remarks: string;
  clientAddress: string;
}

export interface WaterTreatmentDraftInput {
  expectedVersion: number;
  serviceDate: string;
  serviceType: string;
  clientName: string;
  clientAddress: string;
  /** Technician-entered details keyed by WaterTreatmentServiceReportDetails. */
  waterTreatmentDetails: WaterTreatmentServiceReportDetails;
}

const BASE = "/service-reports";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const serviceReportService = {
  list: (): Promise<{ success: boolean; rows: ReportListRow[] }> => api.get(`${BASE}`),

  options: (): Promise<ReportOptionsResponse> => api.get(`${BASE}/options`),

  get: (id: string): Promise<ReportDetailResponse> => api.get(`${BASE}/${encodeURIComponent(id)}`),

  createOrOpen: (input: { invoiceNo?: string; reportType: ServiceReportType; customerId?: string; assignedTechnicianUserId?: string }): Promise<{
    success: boolean;
    report: ServiceReport;
    invoice: ServiceInvoiceCoarseRow | null;
    reusedExisting: boolean;
  }> => api.post(`${BASE}`, { commandId: newId(), ...input }),

  saveDraft: (id: string, input: GeneralDraftInput): Promise<{ success: boolean; report: ServiceReport }> =>
    api.patch(`${BASE}/${encodeURIComponent(id)}`, {
      commandId: newId(),
      expectedVersion: input.expectedVersion,
      serviceDate: input.serviceDate,
      serviceType: input.serviceType,
      fieldReport: input.fieldReport,
      remarks: input.remarks,
      clientAddress: input.clientAddress,
    }),

  saveWaterTreatmentDraft: (id: string, input: WaterTreatmentDraftInput): Promise<{ success: boolean; report: ServiceReport }> =>
    api.patch(`${BASE}/${encodeURIComponent(id)}`, {
      commandId: newId(),
      expectedVersion: input.expectedVersion,
      serviceDate: input.serviceDate,
      serviceType: input.serviceType,
      clientName: input.clientName,
      clientAddress: input.clientAddress,
      waterTreatmentDetails: input.waterTreatmentDetails,
    }),

  changeReportType: (id: string, reportType: ServiceReportType, expectedVersion: number): Promise<{ success: boolean; report: ServiceReport }> =>
    api.post(`${BASE}/${encodeURIComponent(id)}/type`, { commandId: newId(), expectedVersion, reportType }),

  markReady: (id: string, expectedVersion: number): Promise<{ success: boolean; report: ServiceReport }> =>
    api.post(`${BASE}/${encodeURIComponent(id)}/ready`, { commandId: newId(), expectedVersion }),

  acknowledge: (id: string, formData: FormData): Promise<{
    success: boolean;
    report: ServiceReport;
    pdfReady: boolean;
    pdfWarning?: string;
    reused: boolean;
  }> => api.post(`${BASE}/${encodeURIComponent(id)}/acknowledge`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),

  retryPdf: (id: string, expectedVersion: number): Promise<{ success: boolean; report: ServiceReport; reused: boolean }> =>
    api.post(`${BASE}/${encodeURIComponent(id)}/pdf`, { commandId: newId(), expectedVersion }),

  voidReport: (id: string, expectedVersion: number, reason: string): Promise<{ success: boolean; report: ServiceReport }> =>
    api.post(`${BASE}/${encodeURIComponent(id)}/void`, { commandId: newId(), expectedVersion, reason }),

  history: (id: string): Promise<{ success: boolean; history: ServiceReportHistoryEvent[] }> =>
    api.get(`${BASE}/${encodeURIComponent(id)}/history`),
};

export default serviceReportService;

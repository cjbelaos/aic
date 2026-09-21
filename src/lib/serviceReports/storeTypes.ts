// Service Reports — persistence and Drive ports. Defined in their own pure
// module so the orchestration layer (service.ts) and its native-TypeScript
// tests depend only on interfaces, never on live Google APIs.

import type {
  ServiceReport,
  ServiceReportHistoryEvent,
  ServiceReportCommandReceipt,
  ServiceReportSequence,
  ServiceInvoiceCoarseRow,
  WaterTreatmentServiceReportDetails,
} from "../../types/serviceReport.ts";

export interface AllocationResult {
  reportNo: string;
  lastNumber: number;
}

export interface ServiceReportStore {
  listInvoices(): Promise<ServiceInvoiceCoarseRow[]>;
  listReports(): Promise<ServiceReport[]>;
  getReport(serviceReportId: string): Promise<ServiceReport | null>;
  findReportByInvoiceNo(invoiceNo: string): Promise<ServiceReport | null>;
  listHistory(serviceReportId: string): Promise<ServiceReportHistoryEvent[]>;
  listCommands(): Promise<ServiceReportCommandReceipt[]>;
  getSequence(businessYear: string): Promise<ServiceReportSequence | null>;
  /** Serialized AIC-SR allocation; throws a retryable busy error when locked. */
  allocateReportNumber(businessYear: string): Promise<AllocationResult>;
  createReport(report: ServiceReport): Promise<void>;
  /** Enforces the optimistic expectedVersion guard. */
  updateReport(report: ServiceReport, expectedVersion: number): Promise<void>;
  /** Compensation: removes a just-created parent row when the detail write fails. */
  deleteReport(serviceReportId: string): Promise<void>;
  /** Water Treatment detail tab (max one row per serviceReportId). */
  getWaterTreatmentDetails(serviceReportId: string): Promise<WaterTreatmentServiceReportDetails | null>;
  createWaterTreatmentDetails(details: WaterTreatmentServiceReportDetails): Promise<void>;
  updateWaterTreatmentDetails(details: WaterTreatmentServiceReportDetails): Promise<void>;
  deleteWaterTreatmentDetails(serviceReportId: string): Promise<void>;
  appendHistory(event: ServiceReportHistoryEvent): Promise<void>;
  saveCommand(receipt: ServiceReportCommandReceipt): Promise<void>;
}

export interface UploadedPrivateFile {
  fileId: string;
  /** Authorized application URL (Drive proxy), never a public webViewLink. */
  url: string;
}

export interface ServiceReportDrive {
  uploadPrivateFile(input: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    description?: string;
  }): Promise<UploadedPrivateFile>;
  deleteFile(fileId: string): Promise<void>;
  fetchFileBase64(fileId: string): Promise<string>;
}

export type ServiceReportPdfRenderer = (
  report: ServiceReport,
  waterTreatmentDetails: WaterTreatmentServiceReportDetails | null,
  signaturePngBase64: string,
) => Promise<Buffer>;

/** Serializable HTTP-facing shape for allowed report actions. */
export interface ReportAllowedActions {
  edit: boolean;
  ready: boolean;
  acknowledge: boolean;
  retryPdf: boolean;
  void: boolean;
}

export function allowedActionsFor(report: ServiceReport, isAdmin: boolean): ReportAllowedActions {
  const status = report.status;
  return {
    edit: status === "DRAFT",
    ready: status === "DRAFT",
    acknowledge: status === "READY_FOR_ACKNOWLEDGMENT",
    retryPdf: isAdmin && status === "PDF_FAILED",
    void: isAdmin && status !== "VOID",
  };
}
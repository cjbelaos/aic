// Browser-safe status labels (no node imports) shared by pages and domain.

import type { ServiceReportStatus, ServiceReportType } from "../../types/serviceReport.ts";

export const SERVICE_REPORT_STATUS_LABELS: Record<ServiceReportStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_ACKNOWLEDGMENT: "Ready for acknowledgment",
  ACKNOWLEDGED: "Acknowledged",
  PDF_FAILED: "PDF failed",
  VOID: "Void",
};

export const REPORT_TYPE_LABELS: Record<ServiceReportType, string> = {
  GENERAL: "General Service Report",
  WATER_TREATMENT: "Water Treatment System Service Report",
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  WORKING: "Working",
  DEFECTIVE: "Defective",
};

export const SERVICE_REPORT_PDF_STATUS_LABELS: Record<string, string> = {
  NONE: "PDF not generated",
  READY: "PDF ready",
  FAILED: "PDF failed",
};
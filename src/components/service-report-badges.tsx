"use client";

import { Badge } from "@/components/ui/badge";
import { SERVICE_REPORT_STATUS_LABELS } from "@/lib/serviceReports/labels";
import type { ServiceReportStatus } from "@/types/serviceReport";

const STATUS_VARIANTS: Record<ServiceReportStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  READY_FOR_ACKNOWLEDGMENT: "outline",
  ACKNOWLEDGED: "default",
  PDF_FAILED: "destructive",
  VOID: "destructive",
};

export function serviceReportStatusBadge(status: ServiceReportStatus) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>
      {SERVICE_REPORT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function pdfStatusLabel(status: string): string {
  switch (status) {
    case "READY":
      return "PDF ready";
    case "FAILED":
      return "PDF failed";
    default:
      return "PDF not generated";
  }
}
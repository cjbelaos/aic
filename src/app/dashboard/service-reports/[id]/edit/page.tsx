"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { serviceReportStatusBadge } from "@/components/service-report-badges";
import { GeneralServiceReportForm } from "@/components/service-reports/general-service-report-form";
import { WaterTreatmentServiceReportForm } from "@/components/service-reports/water-treatment-service-report-form";
import serviceReportService, { ReportDetailResponse } from "@/lib/services/service-report.service";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import type { ServiceReport, ServiceReportType } from "@/types/serviceReport";

/**
 * Edit/draft loader. The STORED ReportType decides which form renders — never a
 * query parameter.
 */
export default function EditServiceReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const id = params?.id ?? "";
    if (!id) return;
    try {
      const result = await serviceReportService.get(id);
      if (result.report.status !== "DRAFT") toast.info("This report can no longer be edited.");
      setDetail(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load the Service Report.");
    }
  }, [params]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (error) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <h1 className="text-lg font-semibold">Edit Service Report</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      </div>
    );
  }
  if (!detail) return <Card className="animate-pulse bg-muted" />;
  const report = detail.report;

  const onSaved = (saved: ServiceReport) => {
    setDetail((current) => (current ? { ...current, report: saved } : current));
  };

  const changeType = async (nextType: ServiceReportType) => {
    if (nextType === report.reportType || report.status !== "DRAFT") return;
    const nextLabel = REPORT_TYPE_LABELS[nextType];
    if (!window.confirm(`Change this draft to ${nextLabel}? The form will switch to the selected report type.`)) return;
    try {
      await serviceReportService.changeReportType(report.serviceReportId, nextType, report.version);
      setDirty(false);
      await load();
      toast.success("Report type updated.");
    } catch (caught) {
      const data = (caught as { response?: { data?: { message?: string } } }).response?.data;
      toast.error(data?.message || (caught instanceof Error ? caught.message : "Failed to change report type."));
    }
  };

  const goBack = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave anyway?")) return;
    router.push(`/dashboard/service-reports/${report.serviceReportId}`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Edit {REPORT_TYPE_LABELS[report.reportType]}</h1>
          {serviceReportStatusBadge(report.status)}
        </div>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to report
        </Button>
      </div>
      {report.status !== "DRAFT" ? (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          This report is {report.status} and is read-only. Go back to the report to view it.
        </div>
      ) : null}

      {report.status === "DRAFT" ? (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="report-type">Report type</Label>
          <Select value={report.reportType} onValueChange={(value) => void changeType(value as ServiceReportType)}>
            <SelectTrigger id="report-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GENERAL">{REPORT_TYPE_LABELS.GENERAL}</SelectItem>
              <SelectItem value="WATER_TREATMENT">{REPORT_TYPE_LABELS.WATER_TREATMENT}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">You can correct the report type only while this report is a draft.</p>
        </div>
      ) : null}

      {report.reportType === "WATER_TREATMENT" ? (
        <WaterTreatmentServiceReportForm detail={detail} onSaved={onSaved} onDirtyChange={setDirty} />
      ) : (
        <GeneralServiceReportForm detail={detail} onSaved={onSaved} onDirtyChange={setDirty} />
      )}
    </div>
  );
}

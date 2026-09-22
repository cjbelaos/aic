"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { serviceReportStatusBadge } from "@/components/service-report-badges";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import serviceReportService from "@/lib/services/service-report.service";
import { ServiceReport, ServiceReportStatus } from "@/types/serviceReport";

const FILTERS: Array<"all" | ServiceReportStatus> = ["all", "DRAFT", "READY_FOR_ACKNOWLEDGMENT", "ACKNOWLEDGED", "PDF_FAILED", "VOID"];
const STATUS_LABEL: Record<ServiceReportStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_ACKNOWLEDGMENT: "Ready for acknowledgment",
  ACKNOWLEDGED: "Acknowledged",
  PDF_FAILED: "PDF failed",
  VOID: "Void",
};

export default function ServiceReportsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Array<{ report: ServiceReport; invoice: { companyName: string } | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await serviceReportService.list();
      setRows(result.rows ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load Service Reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visible = filter === "all" ? rows : rows.filter((row) => row.report.status === filter);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Service Reports</h1>
          <p className="text-sm text-muted-foreground">Invoice-linked and standalone service reports, signed into a final A4 PDF.</p>
        </div>
        <Button onClick={() => router.push("/dashboard/service-reports/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Service Report
        </Button>
      </div>

      <Select value={filter} onValueChange={(v) => setFilter(v)}>
        <SelectTrigger className="w-60 justify-between">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {FILTERS.map((status) => (
            <SelectItem key={status} value={status}>
              {status === "all" ? `All statuses (${rows.length})` : `${STATUS_LABEL[status]} (${rows.filter((r) => r.report.status === status).length})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error ? (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Card key={i} className="animate-pulse bg-muted" />)}
        </div>
      ) : null}

      {!loading && visible.length === 0 ? (
        <Card>
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No Service Reports found. Create one from a Service Invoice or as standalone service work.
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((row) => {
          const report = row.report;
          return (
            <Card key={report.serviceReportId} className="gap-4">
              <div className="flex flex-col gap-2 px-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums">{report.serviceReportNo || "Draft"}</span>
                  {serviceReportStatusBadge(report.status)}
                </div>
                <p className="text-xs text-muted-foreground">{REPORT_TYPE_LABELS[report.reportType]}</p>
                <p className="text-xs text-muted-foreground">{report.serviceInvoiceNo ? `Service Invoice ${report.serviceInvoiceNo}` : "Standalone service report"}</p>
                <p className="text-sm font-medium">{report.companyNameSnapshot || report.clientNameSnapshot}</p>
                <p className="text-xs text-muted-foreground">{report.assignedTechnicianNameSnapshot || "No technician assigned"}</p>
                <p className="text-xs text-muted-foreground">Service date: {report.serviceDate.slice(0, 10)}</p>
              </div>
              <div className="flex flex-wrap gap-2 px-5 py-2">
                <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/service-reports/${report.serviceReportId}`)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> View
                </Button>
                {report.status === "DRAFT" ? (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/service-reports/${report.serviceReportId}/edit`)}>
                    Edit
                  </Button>
                ) : null}
                {report.pdfUrl ? (
                  <Button size="sm" variant="ghost" asChild aria-label="Open the final PDF">
                    <Link href={report.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</Link>
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

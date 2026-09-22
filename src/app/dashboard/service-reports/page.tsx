"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Eye, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityTable, ArrowUpDown } from "@/components/ui/entity-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { serviceReportStatusBadge } from "@/components/service-report-badges";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import serviceReportService from "@/lib/services/service-report.service";
import type { ServiceReport, ServiceReportStatus } from "@/types/serviceReport";

const FILTERS: Array<"all" | ServiceReportStatus> = ["all", "DRAFT", "READY_FOR_ACKNOWLEDGMENT", "ACKNOWLEDGED", "PDF_FAILED", "VOID"];
const STATUS_LABEL: Record<ServiceReportStatus, string> = {
  DRAFT: "Draft", READY_FOR_ACKNOWLEDGMENT: "Ready for acknowledgment", ACKNOWLEDGED: "Acknowledged", PDF_FAILED: "PDF failed", VOID: "Void",
};

type ReportRow = { report: ServiceReport; invoice: { companyName: string } | null };
const finalPdfUrl = (id: string) => `/api/service-reports/${encodeURIComponent(id)}/pdf`;

function formatDate(value: string): string {
  const raw = value.slice(0, 10);
  if (!raw) return "—";
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? raw : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function ServiceReportsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ServiceReportStatus>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await serviceReportService.list();
      setRows(result.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const visible = useMemo(
    () => filter === "all" ? rows : rows.filter((row) => row.report.status === filter),
    [filter, rows],
  );

  const columns = useMemo<ColumnDef<ReportRow>[]>(() => [
    {
      id: "reportNo",
      accessorFn: (row) => row.report.serviceReportNo || "Draft",
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Report No.<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.report.serviceReportNo || "Draft"}</span>,
    },
    { id: "invoiceNo", accessorFn: (row) => row.report.serviceInvoiceNo || "Standalone", header: "Service Invoice", cell: ({ row }) => row.original.report.serviceInvoiceNo || <span className="text-muted-foreground">Standalone</span> },
    { id: "customer", accessorFn: (row) => row.report.companyNameSnapshot || row.report.clientNameSnapshot, header: "Customer", cell: ({ row }) => row.original.report.companyNameSnapshot || row.original.report.clientNameSnapshot || "—" },
    { id: "reportType", accessorFn: (row) => REPORT_TYPE_LABELS[row.report.reportType], header: "Report Type" },
    { id: "serviceDate", accessorFn: (row) => row.report.serviceDate, header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Service Date<ArrowUpDown className="ml-2 h-4 w-4" /></Button>, cell: ({ row }) => formatDate(row.original.report.serviceDate) },
    { id: "technician", accessorFn: (row) => row.report.assignedTechnicianNameSnapshot, header: "Technician", cell: ({ row }) => row.original.report.assignedTechnicianNameSnapshot || "—" },
    { id: "status", accessorFn: (row) => row.report.status, header: "Status", cell: ({ row }) => serviceReportStatusBadge(row.original.report.status) },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const report = row.original.report;
        return <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/service-reports/${report.serviceReportId}`); }} title="View Service Report"><Eye className="h-4 w-4" /></Button>
          {report.status === "DRAFT" ? <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/service-reports/${report.serviceReportId}/edit`); }} title="Edit draft"><Pencil className="h-4 w-4" /></Button> : null}
          {report.pdfGenerationStatus === "READY" && report.pdfDriveFileId ? <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800" onClick={(event) => { event.stopPropagation(); window.open(finalPdfUrl(report.serviceReportId), "_blank", "noopener,noreferrer"); }} title="Open final PDF"><ExternalLink className="h-4 w-4" /></Button> : null}
        </div>;
      },
    },
  ], [router]);

  return <EntityTable
    title="Service Reports"
    columns={columns}
    data={visible}
    loading={loading}
    getRowId={(row) => row.report.serviceReportId}
    onRowClick={(row) => router.push(`/dashboard/service-reports/${row.report.serviceReportId}`)}
    headerActions={<Button onClick={() => router.push("/dashboard/service-reports/new")}><Plus className="mr-2 h-4 w-4" />New Service Report</Button>}
    toolbarFilters={<Select value={filter} onValueChange={(value) => setFilter(value as "all" | ServiceReportStatus)}><SelectTrigger className="h-8 w-52"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent>{FILTERS.map((status) => <SelectItem key={status} value={status}>{status === "all" ? `All statuses (${rows.length})` : `${STATUS_LABEL[status]} (${rows.filter((row) => row.report.status === status).length})`}</SelectItem>)}</SelectContent></Select>}
    mobileLayout={{ primary: ["reportNo", "customer", "serviceDate", "status"], labels: { reportNo: "Report No.", invoiceNo: "Service Invoice", customer: "Customer", reportType: "Report type", serviceDate: "Service date", technician: "Technician", status: "Status" } }}
  />;
}

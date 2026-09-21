"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, FilePlus2, FileText, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import serviceReportService, { ReportOptionsResponse } from "@/lib/services/service-report.service";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import type { ServiceReportType } from "@/types/serviceReport";

const REPORT_TYPE_CHOICES: Array<{ value: ServiceReportType; description: string }> = [
  { value: "GENERAL", description: "Field report, remarks, and customer acknowledgment." },
  { value: "WATER_TREATMENT", description: "Grouped Before/After measurements and equipment inspection." },
];

function parseTypeParam(value: string | null): ServiceReportType {
  return value === "WATER_TREATMENT" ? "WATER_TREATMENT" : "GENERAL";
}

export default function NewServiceReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceParam = searchParams.get("invoiceNo") ?? "";
  const [options, setOptions] = useState<ReportOptionsResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [invoiceNo, setInvoiceNo] = useState(invoiceParam);
  const [reportType, setReportType] = useState<ServiceReportType>(parseTypeParam(searchParams.get("type")));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<{ id: string; type: string } | null>(null);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      setOptions(await serviceReportService.options());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load options.");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadOptions);
  }, [loadOptions]);

  const eligible = (options?.invoices ?? []).filter((invoice) => invoice.assignedTechnicianUserId);
  const blocked = (options?.invoices ?? []).filter((invoice) => !invoice.assignedTechnicianUserId);
  const blockedMatches = invoiceNo.trim()
    ? blocked.some((invoice) => invoice.invoiceNo.trim().toLowerCase() === invoiceNo.trim().toLowerCase())
    : false;
  const existingForInvoice = invoiceNo.trim()
    ? (options?.invoices ?? []).find((invoice) => invoice.invoiceNo.trim().toLowerCase() === invoiceNo.trim().toLowerCase())
    : undefined;
  const openExisting = (id: string) => router.push(`/dashboard/service-reports/${id}`);

  const submit = async () => {
    if (!invoiceNo.trim()) {
      setError("Select a Service Invoice with an assigned technician first.");
      return;
    }
    if (blockedMatches) {
      setError("Assign a technician before creating a Service Report.");
      return;
    }
    setError("");
    setConflict(null);
    setSubmitting(true);
    try {
      const result = await serviceReportService.createOrOpen(invoiceNo.trim(), reportType);
      if (result.reusedExisting) {
        toast.info("This invoice already has a Service Report - opening the existing one.");
      } else {
        toast.success(`${REPORT_TYPE_LABELS[result.report.reportType]} draft created.`);
      }
      router.push(`/dashboard/service-reports/${result.report.serviceReportId}${result.report.status === "DRAFT" ? "/edit" : ""}`);
    } catch (caught) {
      const data = (caught as { response?: { data?: { message?: string; fieldErrors?: Record<string, string> } } }).response?.data;
      const existingId = data?.fieldErrors?.existingReportId;
      if (existingId) {
        setConflict({ id: existingId, type: data?.fieldErrors?.existingReportType || "GENERAL" });
        setError("A service report already exists for this invoice.");
      } else {
        setError(data?.message || (caught instanceof Error ? caught.message : "Failed to create the Service Report."));
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Service Report</h1>
        <p className="text-sm text-muted-foreground">
          Creates a draft for a Service Invoice, or opens the existing report if one is already active.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose a Service Invoice</CardTitle>
          <CardDescription>A technician must be assigned before a Service Report can be created.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOptions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Service Invoice</Label>
                <Input
                  list="service-report-invoice-options"
                  value={invoiceNo}
                  onChange={(e) => { setInvoiceNo(e.target.value); setConflict(null); }}
                  placeholder="Select or type an invoice number"
                  aria-label="Service Invoice number"
                />
                <datalist id="service-report-invoice-options">
                  {eligible.map((invoice) => (
                    <option key={invoice.invoiceNo} value={invoice.invoiceNo}>
                      {invoice.invoiceNo} - {invoice.companyName} ({invoice.assignedTechnicianName})
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="mt-6 space-y-2">
                <Label>Service Report type</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REPORT_TYPE_CHOICES.map((choice) => {
                    const selected = reportType === choice.value;
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setReportType(choice.value)}
                        aria-pressed={selected}
                        className={
                          "flex items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors " +
                          (selected ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50")
                        }
                      >
                        {choice.value === "GENERAL"
                          ? <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                          : <Droplets className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{REPORT_TYPE_LABELS[choice.value]}</span>
                          <span className="text-xs text-muted-foreground">{choice.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  The type is fixed once the report is created and cannot be changed later.
                </p>
              </div>

              {blocked.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {blocked.length} invoice(s) have no technician assigned yet and cannot start a report:
                  {blocked.slice(0, 3).map((invoice) => invoice.invoiceNo).join(", ")}
                  {blocked.length > 3 ? ` and ${blocked.length - 3} more` : ""}.
                </p>
              ) : null}

              {blockedMatches ? (
                <p className="mt-3 text-sm text-destructive">
                  Assign a technician before creating a Service Report. Edit the Service Invoice to set an Assigned Technician first.
                </p>
              ) : null}

              {conflict ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <span>A service report already exists for this invoice.</span>
                  <Badge variant="outline">{REPORT_TYPE_LABELS[conflict.type as ServiceReportType] ?? conflict.type}</Badge>
                  <Button size="sm" variant="outline" onClick={() => openExisting(conflict.id)}>
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> View Service Report
                  </Button>
                </div>
              ) : error ? (
                <p className="mt-3 text-sm text-destructive">{error}</p>
              ) : null}

              {!conflict && existingForInvoice?.serviceReportId ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  This invoice already has a report
                  {existingForInvoice.reportType ? ` (${REPORT_TYPE_LABELS[existingForInvoice.reportType as ServiceReportType] ?? existingForInvoice.reportType})` : ""}.
                  Creating again opens the existing report instead.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={submit} disabled={submitting || loadingOptions || !invoiceNo.trim() || blockedMatches || Boolean(conflict)}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
            {submitting ? "Creating..." : "Create / Open Service Report"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

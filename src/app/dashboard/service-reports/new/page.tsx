"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, FilePlus2, FileText, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  const [customerId, setCustomerId] = useState("");
  const [assignedTechnicianUserId, setAssignedTechnicianUserId] = useState("");
  const [createWithoutInvoice, setCreateWithoutInvoice] = useState(false);
  const [standaloneReason, setStandaloneReason] = useState("");
  const [standaloneReasonDetails, setStandaloneReasonDetails] = useState("");
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
  const standalone = createWithoutInvoice;

  const submit = async () => {
    if (!standalone && !invoiceNo) {
      setError("Select a Service Invoice before creating the report.");
      return;
    }
    if (standalone && (!customerId || !assignedTechnicianUserId || !standaloneReason || (standaloneReason === "OTHER" && !standaloneReasonDetails.trim()))) {
      setError("Complete the customer, technician, and reason for creating a report without a Service Invoice.");
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
      const result = await serviceReportService.createOrOpen({
        invoiceNo: standalone ? "" : invoiceNo,
        reportType,
        customerId,
        assignedTechnicianUserId,
        createWithoutInvoice: standalone,
        standaloneReason,
        standaloneReasonDetails,
      });
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
          Select the Service Invoice for this report. Creating without one is reserved for documented exceptions such as warranty or emergency work.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{standalone ? "Service Invoice exception" : "Select Service Invoice"}</CardTitle>
          <CardDescription>{standalone ? "Record why this report cannot be linked to an invoice." : "A Service Invoice is required by default so every report stays linked to its service record."}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOptions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...
            </div>
          ) : (
            <>
              {!standalone ? (
                <div className="space-y-2">
                  <Label>Service Invoice <span className="text-destructive">*</span></Label>
                  <SearchableSelect
                    value={invoiceNo}
                    onValueChange={(value) => { setInvoiceNo(value); setConflict(null); setError(""); }}
                    options={eligible.map((invoice) => ({ value: invoice.invoiceNo, label: `${invoice.invoiceNo} — ${invoice.companyName} (${invoice.assignedTechnicianName})` }))}
                    placeholder="Select a Service Invoice…"
                    searchPlaceholder="Search invoice number or customer…"
                    emptyText="No eligible Service Invoice found."
                  />
                  <p className="text-xs text-muted-foreground">Only invoices with an assigned technician are available.</p>
                  <Button type="button" variant="link" className="h-auto px-0 text-xs" onClick={() => { setCreateWithoutInvoice(true); setInvoiceNo(""); setConflict(null); setError(""); }}>
                    No Service Invoice? Create an exception report
                  </Button>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <p className="font-medium">Creating without a Service Invoice</p>
                    <p className="mt-1 text-muted-foreground">Use this only for emergency, warranty, no-charge, or other exceptional service. The reason is recorded in the report history.</p>
                    <Button type="button" variant="link" className="mt-2 h-auto px-0 text-xs" onClick={() => { setCreateWithoutInvoice(false); setError(""); }}>
                      Use a Service Invoice instead
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="standalone-customer">Customer <span className="text-destructive">*</span></Label>
                    <SearchableSelect value={customerId} onValueChange={(value) => { setCustomerId(value); setError(""); }} options={(options?.customers ?? []).map((customer) => ({ value: customer.customerId, label: customer.companyName }))} placeholder="Select customer…" searchPlaceholder="Search customer…" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="standalone-technician">Assigned technician <span className="text-destructive">*</span></Label>
                    <SearchableSelect value={assignedTechnicianUserId} onValueChange={(value) => { setAssignedTechnicianUserId(value); setError(""); }} options={(options?.users ?? []).map((user) => ({ value: user.userId, label: user.fullName }))} placeholder="Select technician…" searchPlaceholder="Search technician…" />
                    <p className="text-xs text-muted-foreground">The selected technician will have access to this report.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="standalone-reason">Why is there no Service Invoice? <span className="text-destructive">*</span></Label>
                    <select id="standalone-reason" value={standaloneReason} onChange={(event) => { setStandaloneReason(event.target.value); setError(""); }} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="">Select a reason</option>
                      <option value="EMERGENCY_REPAIR">Emergency repair</option>
                      <option value="WARRANTY_SERVICE">Warranty service</option>
                      <option value="NO_CHARGE_SERVICE">No-charge service</option>
                      <option value="OTHER">Other documented exception</option>
                    </select>
                  </div>
                  {standaloneReason === "OTHER" ? <div className="space-y-2 md:col-span-2"><Label htmlFor="standalone-reason-details">Exception details <span className="text-destructive">*</span></Label><Textarea id="standalone-reason-details" value={standaloneReasonDetails} onChange={(event) => { setStandaloneReasonDetails(event.target.value); setError(""); }} placeholder="Explain why no Service Invoice applies" /></div> : null}
                </div>
              )}

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

              {!standalone && blocked.length > 0 ? (
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
          <Button onClick={submit} disabled={submitting || loadingOptions || (!standalone && !invoiceNo) || (standalone && (!customerId || !assignedTechnicianUserId || !standaloneReason || (standaloneReason === "OTHER" && !standaloneReasonDetails.trim()))) || blockedMatches || Boolean(conflict)}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
            {submitting ? "Creating..." : "Create / Open Service Report"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

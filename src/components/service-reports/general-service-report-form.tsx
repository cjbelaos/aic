"use client";

// General Service Report edit form. Extracted from the original edit page so the
// stored ReportType can dispatch between the General and Water Treatment forms
// without changing General behavior.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import serviceReportService, { ReportDetailResponse } from "@/lib/services/service-report.service";
import type { ServiceReport } from "@/types/serviceReport";

export interface ServiceReportFormProps {
  detail: ReportDetailResponse;
  onSaved: (report: ServiceReport) => void;
  /** Reports unsaved changes so the page can guard navigation. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function GeneralServiceReportForm({ detail, onSaved, onDirtyChange }: ServiceReportFormProps) {
  const router = useRouter();
  const report = detail.report;
  const [version, setVersion] = useState(report.version);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readying, setReadying] = useState(false);
  const [serviceDate, setServiceDate] = useState(report.serviceDate);
  const [serviceType, setServiceType] = useState(report.serviceType);
  const [fieldReport, setFieldReport] = useState(report.fieldReport);
  const [remarks, setRemarks] = useState(report.remarks);
  const [clientAddress, setClientAddress] = useState(report.clientAddressSnapshot);

  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, onDirtyChange]);

  const mark = (setter: (value: string) => void, value: string) => {
    setter(value);
    setDirty(true);
  };

  const doSave = async (thenReady: boolean) => {
    if (!serviceDate || !serviceType.trim() || !fieldReport.trim()) {
      setError("Service date, service type, and the field report are required before saving.");
      return;
    }
    setError("");
    if (thenReady) setReadying(true); else setSaving(true);
    try {
      const saved = await serviceReportService.saveDraft(report.serviceReportId, {
        expectedVersion: version,
        serviceDate,
        serviceType: serviceType.trim(),
        fieldReport: fieldReport.trim(),
        remarks,
        clientAddress,
      });
      setVersion(saved.report.version);
      setDirty(false);
      onSaved(saved.report);
      if (thenReady) {
        const ready = await serviceReportService.markReady(saved.report.serviceReportId, saved.report.version);
        toast.success("Report ready for customer acknowledgment.");
        router.push(`/dashboard/service-reports/${ready.report.serviceReportId}/acknowledge`);
      } else {
        toast.success("Draft saved.");
      }
    } catch (caught) {
      // Conflict recovery: the typed values stay on screen; only the version
      // advances so the technician can retry immediately.
      const data = (caught as { response?: { data?: { message?: string; currentVersion?: number } } }).response?.data;
      if (typeof data?.currentVersion === "number") setVersion(data.currentVersion);
      setError(data?.message || (caught instanceof Error ? caught.message : "Failed to save the draft."));
    } finally {
      setSaving(false);
      setReadying(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card>
        <CardHeader><CardTitle>Service information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Service Report No.</Label><Input value="Draft (assigned after acknowledgment)" readOnly className="bg-muted" /></div>
            <div className="space-y-2"><Label>Service Invoice No.</Label><Input value={report.serviceInvoiceNo} readOnly className="bg-muted" /></div>
            <div className="space-y-2">
              <Label>Service date <span className="text-destructive">*</span></Label>
              <Input type="date" value={serviceDate} onChange={(e) => mark(setServiceDate, e.target.value)} aria-invalid={!serviceDate} />
            </div>
            <div className="space-y-2"><Label>Company / customer</Label><Input value={report.companyNameSnapshot} readOnly className="bg-muted" /></div>
            <div className="space-y-2"><Label>Client name</Label><Input value={report.clientNameSnapshot} readOnly className="bg-muted" /></div>
            <div className="space-y-2"><Label>Attended by</Label><Input value={report.assignedTechnicianNameSnapshot} readOnly className="bg-muted" /></div>
            <div className="space-y-2">
              <Label>Client address</Label>
              <Input value={clientAddress} onChange={(e) => mark(setClientAddress, e.target.value)} placeholder={report.clientAddressSnapshot || "Site address if it differs from the invoice address"} aria-label="Client address" />
              <p className="text-xs text-muted-foreground">Pre-filled from the Service Invoice; correction is allowed only while the report is a draft.</p>
            </div>
            <div className="space-y-2">
              <Label>Service type <span className="text-destructive">*</span></Label>
              <Input value={serviceType} onChange={(e) => mark(setServiceType, e.target.value)} placeholder="e.g. Preventive maintenance, repair" aria-invalid={!serviceType.trim()} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Report</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Field report <span className="text-destructive">*</span></Label>
            <Textarea rows={6} value={fieldReport} onChange={(e) => mark(setFieldReport, e.target.value)} placeholder="Describe the work performed and the condition found" aria-invalid={!fieldReport.trim()} />
          </div>
          <div className="mt-4 space-y-2">
            <Label>Remarks</Label>
            <Textarea rows={3} value={remarks} onChange={(e) => mark(setRemarks, e.target.value)} placeholder="Recommendations, unresolved issues, or follow-up (optional)" />
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Save keeps this draft editable. Marking ready for acknowledgment hands the report to the customer representative for review and signature.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void doSave(false)} disabled={saving || readying}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? "Saving..." : "Save draft"}
            </Button>
            <Button onClick={() => void doSave(true)} disabled={saving || readying || report.status !== "DRAFT"}>
              {readying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {readying ? "Saving..." : "Save and mark ready for acknowledgment"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

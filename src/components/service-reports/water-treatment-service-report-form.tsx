"use client";

// Water Treatment System Service Report edit form.
//
// Desktop shows each Before/After pair side by side; small screens render each
// pair as a stacked card with persistent Before and After labels so no
// horizontal measurement grid is required at 320-430px widths.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import serviceReportService, { ReportDetailResponse } from "@/lib/services/service-report.service";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import {
  emptyWaterTreatmentDetails,
  WATER_TREATMENT_EQUIPMENT_FIELDS,
  WATER_TREATMENT_MEASUREMENT_SECTIONS,
  WATER_TREATMENT_SAMPLE_FIELDS,
} from "@/lib/serviceReports/waterTreatmentDetails";
import type { ServiceReport, WaterTreatmentServiceReportDetails } from "@/types/serviceReport";
import type { ServiceReportFormProps } from "./general-service-report-form";

// Radix Select cannot use an empty-string value, so unanswered maps to UNSET.
const UNSET = "__unset";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function equipmentSelectValue(stored: string): string {
  return stored === "WORKING" || stored === "DEFECTIVE" ? stored : UNSET;
}

export function WaterTreatmentServiceReportForm({ detail, onSaved, onDirtyChange }: ServiceReportFormProps) {
  const router = useRouter();
  const report = detail.report;
  const initialDetails = useMemo<WaterTreatmentServiceReportDetails>(
    () => detail.waterTreatmentDetails ?? emptyWaterTreatmentDetails(report.serviceReportId, report.createdBy || "system", report.createdAt || ""),
    [detail.waterTreatmentDetails, report.serviceReportId, report.createdBy, report.createdAt],
  );
  const [version, setVersion] = useState(report.version);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readying, setReadying] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serviceDate, setServiceDate] = useState(report.serviceDate);
  const [serviceType, setServiceType] = useState(report.serviceType);
  const [clientName, setClientName] = useState(report.clientNameSnapshot);
  const [clientAddress, setClientAddress] = useState(report.clientAddressSnapshot);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const base = initialDetails as unknown as Record<string, string>;
    const seeded: Record<string, string> = { emailAddress: base.emailAddress ?? "" };
    for (const section of WATER_TREATMENT_MEASUREMENT_SECTIONS) {
      for (const field of section.fields) {
        seeded[field.beforeKey] = base[field.beforeKey] ?? "";
        seeded[field.afterKey] = base[field.afterKey] ?? "";
      }
    }
    for (const sample of WATER_TREATMENT_SAMPLE_FIELDS) seeded[sample.key] = base[sample.key] ?? "";
    for (const equipment of WATER_TREATMENT_EQUIPMENT_FIELDS) seeded[equipment.key] = equipmentSelectValue(base[equipment.key] ?? "");
    seeded.remarks = base.remarks ?? "";
    seeded.recommendation = base.recommendation ?? "";
    return seeded;
  });

  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, onDirtyChange]);

  const setValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };
  const markText = (setter: (value: string) => void, value: string) => {
    setter(value);
    setDirty(true);
  };

  const buildDetails = (): WaterTreatmentServiceReportDetails => {
    const merged = { ...initialDetails } as unknown as Record<string, string>;
    for (const [key, value] of Object.entries(values)) {
      merged[key] = value === UNSET ? "" : value;
    }
    return merged as unknown as WaterTreatmentServiceReportDetails;
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!serviceDate) errors.serviceDate = "Service date is required.";
    if (!serviceType.trim()) errors.serviceType = "Service type is required.";
    if (!clientName.trim()) errors.clientName = "Client name is required.";
    const email = (values.emailAddress ?? "").trim();
    if (email && !EMAIL_PATTERN.test(email)) errors.emailAddress = "Enter a valid email address.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const doSave = async (thenReady: boolean) => {
    if (!validate()) {
      setError("Complete the highlighted fields before saving.");
      return;
    }
    setError("");
    if (thenReady) setReadying(true); else setSaving(true);
    try {
      const saved = await serviceReportService.saveWaterTreatmentDraft(report.serviceReportId, {
        expectedVersion: version,
        serviceDate,
        serviceType: serviceType.trim(),
        clientName: clientName.trim(),
        clientAddress,
        waterTreatmentDetails: buildDetails(),
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
      const data = (caught as { response?: { data?: { message?: string; currentVersion?: number; fieldErrors?: Record<string, string> } } }).response?.data;
      if (typeof data?.currentVersion === "number") setVersion(data.currentVersion);
      if (data?.fieldErrors) setFieldErrors(data.fieldErrors);
      setError(data?.message || (caught instanceof Error ? caught.message : "Failed to save the draft."));
    } finally {
      setSaving(false);
      setReadying(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Service information</CardTitle>
          <CardDescription>Email, client name, and address are entered here and never change the customer or Service Invoice records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Service Report No.</Label><Input value="Draft (assigned after acknowledgment)" readOnly className="bg-muted" /></div>
            <div className="space-y-2"><Label>Service Invoice No.</Label><Input value={report.serviceInvoiceNo} readOnly className="bg-muted" /></div>
            <div className="space-y-2">
              <Label>Report type</Label>
              <div><Badge variant="outline">{REPORT_TYPE_LABELS[report.reportType]}</Badge></div>
            </div>
            <div className="space-y-2"><Label>Attended by</Label><Input value={report.assignedTechnicianNameSnapshot} readOnly className="bg-muted" /></div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={values.emailAddress ?? ""} onChange={(e) => setValue("emailAddress", e.target.value)} placeholder="name@example.com" inputMode="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.emailAddress)} aria-label="Email" />
              {fieldErrors.emailAddress ? <p className="text-xs text-destructive">{fieldErrors.emailAddress}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Service date <span className="text-destructive">*</span></Label>
              <Input type="date" value={serviceDate} onChange={(e) => markText(setServiceDate, e.target.value)} aria-invalid={Boolean(fieldErrors.serviceDate)} />
              {fieldErrors.serviceDate ? <p className="text-xs text-destructive">{fieldErrors.serviceDate}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Client name <span className="text-destructive">*</span></Label>
              <Input value={clientName} onChange={(e) => markText(setClientName, e.target.value)} placeholder="Customer / client name" aria-invalid={Boolean(fieldErrors.clientName)} aria-label="Client name" />
              {fieldErrors.clientName ? <p className="text-xs text-destructive">{fieldErrors.clientName}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Service type <span className="text-destructive">*</span></Label>
              <Input value={serviceType} onChange={(e) => markText(setServiceType, e.target.value)} placeholder="e.g. Preventive maintenance" aria-invalid={Boolean(fieldErrors.serviceType)} aria-label="Service type" />
              {fieldErrors.serviceType ? <p className="text-xs text-destructive">{fieldErrors.serviceType}</p> : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Client address</Label>
              <Input value={clientAddress} onChange={(e) => markText(setClientAddress, e.target.value)} placeholder="Service site address" aria-label="Client address" />
              <p className="text-xs text-muted-foreground">Pre-filled from the Service Invoice; editing here does not change the invoice or customer record.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {WATER_TREATMENT_MEASUREMENT_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {section.fields.map((field) => (
                <div key={field.key} className="rounded-md border border-input p-3">
                  <p className="text-sm font-medium">{field.label}</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground" htmlFor={`${field.key}-before`}>Before</Label>
                      <Input id={`${field.key}-before`} value={values[field.beforeKey] ?? ""} onChange={(e) => setValue(field.beforeKey, e.target.value)} placeholder="Not recorded" aria-label={`${field.label} Before`} />
                      {fieldErrors[field.beforeKey] ? <p className="text-xs text-destructive">{fieldErrors[field.beforeKey]}</p> : null}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground" htmlFor={`${field.key}-after`}>After</Label>
                      <Input id={`${field.key}-after`} value={values[field.afterKey] ?? ""} onChange={(e) => setValue(field.afterKey, e.target.value)} placeholder="Not recorded" aria-label={`${field.label} After`} />
                      {fieldErrors[field.afterKey] ? <p className="text-xs text-destructive">{fieldErrors[field.afterKey]}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Samples and equipment inspection</CardTitle>
          <CardDescription>Water-sample answers are free text. Equipment fields accept Working or Defective.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {WATER_TREATMENT_SAMPLE_FIELDS.map((sample) => (
              <div key={sample.key} className="space-y-2">
                <Label htmlFor={sample.key}>{sample.label}</Label>
                <Textarea id={sample.key} rows={2} value={values[sample.key] ?? ""} onChange={(e) => setValue(sample.key, e.target.value)} placeholder="Enter the result or remarks" aria-label={sample.label} />
                {fieldErrors[sample.key] ? <p className="text-xs text-destructive">{fieldErrors[sample.key]}</p> : null}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium">Equipment inspection</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {WATER_TREATMENT_EQUIPMENT_FIELDS.map((equipment) => (
                <div key={equipment.key} className="flex flex-col gap-1">
                  <Label htmlFor={equipment.key} className="text-xs text-muted-foreground">{equipment.label}</Label>
                  <Select value={values[equipment.key] ?? UNSET} onValueChange={(v) => setValue(equipment.key, v)}>
                    <SelectTrigger id={equipment.key} className="w-full justify-between" aria-label={equipment.label}>
                      <SelectValue placeholder="Not recorded" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>Not recorded</SelectItem>
                      <SelectItem value="WORKING">Working</SelectItem>
                      <SelectItem value="DEFECTIVE">Defective</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors[equipment.key] ? <p className="text-xs text-destructive">{fieldErrors[equipment.key]}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Remarks and Recommendation</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea id="remarks" rows={3} value={values.remarks ?? ""} onChange={(e) => setValue("remarks", e.target.value)} placeholder="Findings and observations" aria-label="Remarks" />
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="recommendation">Recommendation</Label>
            <Textarea id="recommendation" rows={3} value={values.recommendation ?? ""} onChange={(e) => setValue("recommendation", e.target.value)} placeholder="Recommended actions or follow-up" aria-label="Recommendation" />
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Save keeps this draft editable. Marking ready hands the report to the customer representative for the acknowledgment step.
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

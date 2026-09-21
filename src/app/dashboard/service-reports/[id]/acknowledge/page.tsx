"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { serviceReportStatusBadge } from "@/components/service-report-badges";
import { ServiceReportSignaturePad, SignaturePadState } from "@/components/service-report-signature-pad";
import serviceReportService, { ReportDetailResponse } from "@/lib/services/service-report.service";
import { ACKNOWLEDGMENT_TEXT } from "@/lib/serviceReports/constants";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import {
  WATER_TREATMENT_EQUIPMENT_FIELDS,
  WATER_TREATMENT_MEASUREMENT_SECTIONS,
  WATER_TREATMENT_SAMPLE_FIELDS,
} from "@/lib/serviceReports/waterTreatmentDetails";

export default function AcknowledgeServiceReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [consent, setConsent] = useState(false);
  const [pad, setPad] = useState<SignaturePadState>({ png: null, hasMeaningfulInk: false, isEmpty: true, hint: "Draw your signature in the box above." });
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const load = useCallback(async () => {
    const id = params?.id ?? "";
    if (!id) return;
    try {
      const result = await serviceReportService.get(id);
      if (result.report.status !== "READY_FOR_ACKNOWLEDGMENT") {
        toast.info(`This report is ${result.report.status.replaceAll("_", " ").toLowerCase()} — it cannot be acknowledged here.`);
      }
      setDetail(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load the Service Report.");
    }
  }, [params]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (error) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <h1 className="text-lg font-semibold">Acknowledge Service Report</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      </div>
    );
  }
  if (!detail) return <Card className="animate-pulse bg-muted" />;
  const report = detail.report;
  const isWaterTreatment = report.reportType === "WATER_TREATMENT";
  const wtDetails = (detail.waterTreatmentDetails ?? null) as unknown as Record<string, string> | null;
  const displayValue = (value: string | undefined) => (value && value.trim() ? value.trim() : "—");
  const equipmentDisplay = (value: string | undefined) =>
    value === "WORKING" ? "Working" : value === "DEFECTIVE" ? "Defective" : "—";
  const canSubmit = report.status === "READY_FOR_ACKNOWLEDGMENT"
    && fullName.trim().length > 0
    && consent
    && pad.hasMeaningfulInk
    && pad.png !== null;

  const submit = async () => {
    setFieldError("");
    if (!fullName.trim()) { setFieldError("Enter the full name of the person acknowledging the service."); return; }
    if (!consent) { setFieldError("Check the acknowledgment statement before submitting."); return; }
    if (!pad.hasMeaningfulInk || !pad.png) { setFieldError(pad.hint || "Draw your full signature before submitting."); return; }
    setSubmitting(true);
    const form = new FormData();
    form.set("expectedVersion", String(report.version));
    form.set("acknowledgedByFullName", fullName.trim());
    form.set("acknowledgedByPosition", position);
    form.set("consentConfirmed", consent ? "true" : "false");
    if (pad.png) form.set("signature", pad.png, "signature.png");
    try {
      const result = await serviceReportService.acknowledge(report.serviceReportId, form);
      if (result.pdfWarning) toast.warning(result.pdfWarning);
      else toast.success("Service Report acknowledged and signed.");
      router.push(`/dashboard/service-reports/${result.report.serviceReportId}`);
    } catch (caught) {
      const data = (caught as { response?: { data?: { message?: string; fieldErrors?: Record<string, string> } } }).response?.data;
      const field = data?.fieldErrors ? Object.values(data.fieldErrors)[0] : undefined;
      setFieldError(field || data?.message || (caught instanceof Error ? caught.message : "Failed to submit the acknowledgment."));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Customer acknowledgment</h1>
          <Badge variant="outline">{REPORT_TYPE_LABELS[report.reportType]}</Badge>
          {serviceReportStatusBadge(report.status)}
        </div>
        <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>

      {report.status !== "READY_FOR_ACKNOWLEDGMENT" ? (
        <Card>
          <div className="px-6 py-8 text-sm text-muted-foreground">
            This report is {report.status.replaceAll("_", " ").toLowerCase()} and cannot be acknowledged on this screen.
          </div>
        </Card>
      ) : null}
      {report.status === "READY_FOR_ACKNOWLEDGMENT" ? (
        <>
          <Card>
            <CardHeader><CardTitle>Report to be acknowledged</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">The customer representative reviews the completed report before acknowledging the work.</p>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Service Invoice</dt><dd className="font-medium">{report.serviceInvoiceNo}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Service date</dt><dd>{report.serviceDate.slice(0, 10)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Company</dt><dd>{report.companyNameSnapshot}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Client</dt><dd>{report.clientNameSnapshot}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Client address</dt><dd>{report.clientAddressSnapshot || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Attended by</dt><dd>{report.assignedTechnicianNameSnapshot}</dd></div>
                <div className="col-span-full"><dt className="text-xs text-muted-foreground">Service type</dt><dd>{report.serviceType}</dd></div>
                {isWaterTreatment ? (
                  <>
                    <div className="col-span-full"><dt className="text-xs text-muted-foreground">Email</dt><dd>{displayValue(wtDetails?.emailAddress)}</dd></div>
                    {WATER_TREATMENT_MEASUREMENT_SECTIONS.map((section) => (
                      <div key={section.title} className="col-span-full">
                        <dt className="text-xs text-muted-foreground">{section.title}</dt>
                        <dd className="mt-1 flex flex-col gap-1">
                          {section.fields.map((pair) => (
                            <span key={pair.key} className="text-sm">
                              {pair.label}: Before {displayValue(wtDetails?.[pair.beforeKey])} · After {displayValue(wtDetails?.[pair.afterKey])}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                    <div className="col-span-full">
                      <dt className="text-xs text-muted-foreground">Water samples</dt>
                      <dd className="mt-1 flex flex-col gap-1">
                        {WATER_TREATMENT_SAMPLE_FIELDS.map((sample) => (
                          <span key={sample.key} className="text-sm">{sample.label}: {displayValue(wtDetails?.[sample.key])}</span>
                        ))}
                      </dd>
                    </div>
                    <div className="col-span-full">
                      <dt className="text-xs text-muted-foreground">Equipment inspection</dt>
                      <dd className="mt-1 flex flex-col gap-1">
                        {WATER_TREATMENT_EQUIPMENT_FIELDS.map((equipment) => (
                          <span key={equipment.key} className="text-sm">{equipment.label}: {equipmentDisplay(wtDetails?.[equipment.key])}</span>
                        ))}
                      </dd>
                    </div>
                    <div className="col-span-full"><dt className="text-xs text-muted-foreground">Remarks</dt><dd className="whitespace-pre-wrap">{displayValue(wtDetails?.remarks)}</dd></div>
                    <div className="col-span-full"><dt className="text-xs text-muted-foreground">Recommendation</dt><dd className="whitespace-pre-wrap">{displayValue(wtDetails?.recommendation)}</dd></div>
                  </>
                ) : (
                  <>
                    <div className="col-span-full"><dt className="text-xs text-muted-foreground">Field report</dt><dd className="whitespace-pre-wrap">{report.fieldReport}</dd></div>
                    {report.remarks ? (
                      <div className="col-span-full"><dt className="text-xs text-muted-foreground">Remarks</dt><dd className="whitespace-pre-wrap">{report.remarks}</dd></div>
                    ) : null}
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Acknowledged by</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full name <span className="text-destructive">*</span></Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name of the customer representative" aria-invalid={fullName.trim().length === 0} autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label>Position / department (optional)</Label>
                  <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Building administrator" autoComplete="organization-title" />
                </div>
              </div>

              <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
                “{ACKNOWLEDGMENT_TEXT}”
              </div>

              <div className="mt-4 flex items-start gap-3">
                <Checkbox id="ack-consent" checked={consent} onCheckedChange={(c) => setConsent(Boolean(c))} aria-label="I acknowledge the statement" />
                <label htmlFor="ack-consent" className="text-sm">
                  I acknowledge that the service described in this report was performed and that I had the opportunity to review the field report and remarks.
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Signature</CardTitle></CardHeader>
            <CardContent>
              <ServiceReportSignaturePad onStateChange={setPad} disabled={submitting} />
              <p className="mt-2 text-center text-sm font-medium">{fullName.trim() || "Signed by"}</p>
              {pad.hint ? <p className="mt-1 text-xs text-muted-foreground">{pad.hint}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">Draw with a finger, stylus, or mouse. The signature is sent as a PNG only when you submit.</p>
            </CardContent>
            <CardFooter>
              <div className="flex flex-wrap items-center gap-3">
                {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                <Button onClick={submit} disabled={submitting || !canSubmit}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {submitting ? "Submitting…" : "Submit acknowledgment"}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </>
      ) : null}
    </div>
  );
}
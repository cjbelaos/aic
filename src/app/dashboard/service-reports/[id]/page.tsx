"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Pencil, CheckCircle2, Loader2, FileText, Ban, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/logo-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { serviceReportStatusBadge, pdfStatusLabel } from "@/components/service-report-badges";
import serviceReportService, { ReportDetailResponse } from "@/lib/services/service-report.service";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import {
  WATER_TREATMENT_EQUIPMENT_FIELDS,
  WATER_TREATMENT_MEASUREMENT_SECTIONS,
  WATER_TREATMENT_SAMPLE_FIELDS,
} from "@/lib/serviceReports/waterTreatmentDetails";

const SIGNATURE_PROXY = "/api/images/drive/";
const fmt = (iso: string) => (iso || "").slice(0, 19).replace("T", " ");
const fmtSignedAt = (iso: string) => (iso || "").slice(0, 19).replace("T", " ").replace(/:/g, "-");
const display = (value: string | undefined) => (value && value.trim() ? value.trim() : "—");
const equipmentLabel = (value: string | undefined) =>
  value === "WORKING" ? "Working" : value === "DEFECTIVE" ? "Defective" : "—";

export default function ServiceReportDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const id = params?.id ?? "";
    if (!id) return;
    setLoading(true);
    setError("");
    try { setDetail(await serviceReportService.get(id)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to load the Service Report."); } finally { setLoading(false); }
  }, [params]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (loading) return <PageLoader label="Loading Service Report…" />;
  if (error || !detail) return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-lg font-semibold">Service Report</h1>
      <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">{error || "Not found."}</div>
    </div>
  );

  const report = detail.report;
  const actions = detail.allowedActions;
  const routerToEdit = () => router.push(`/dashboard/service-reports/${report.serviceReportId}/edit`);
  const routerToAck = () => router.push(`/dashboard/service-reports/${report.serviceReportId}/acknowledge`);
  const isWaterTreatment = report.reportType === "WATER_TREATMENT";
  const details = (detail.waterTreatmentDetails ?? null) as unknown as Record<string, string> | null;
  /** Never fall back to the General layout: a missing detail row renders dashes. */
  const wt = details ?? {};

  const retryPdf = async () => {
    setBusy("pdf");
    try {
      await serviceReportService.retryPdf(report.serviceReportId, report.version);
      toast.success("PDF generated and uploaded.");
      await Promise.resolve().then(load);
    } catch (caught) {
      const data = (caught as { response?: { data?: { message?: string } } }).response?.data;
      toast.error(data?.message || "PDF retry failed. The acknowledgment is preserved; retry again later.");
    } finally { setBusy(""); }
  };

  const confirmVoid = async () => {
    if (!voidReason.trim()) return;
    setVoiding(true);
    try {
      await serviceReportService.voidReport(report.serviceReportId, report.version, voidReason.trim());
      toast.success("Service Report voided.");
      setVoidOpen(false);
      await Promise.resolve().then(load);
    } catch (caught) {
      const data = (caught as { response?: { data?: { message?: string } } }).response?.data;
      toast.error(data?.message || "Failed to void the Service Report.");
    } finally { setVoiding(false); }
  };

  const field = (label: string, value: string | number) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="tabular-nums">{value || "—"}</dd></div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button variant="outline" onClick={() => router.push("/dashboard/service-reports")} className="w-full self-start sm:w-auto">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Service Reports
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{report.serviceReportNo || "Draft Service Report"}</h1>
            {serviceReportStatusBadge(report.status)}
            <Badge variant="outline">{REPORT_TYPE_LABELS[report.reportType]}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.edit ? <Button onClick={routerToEdit}><Pencil className="mr-2 h-4 w-4" /> Edit Draft</Button> : null}
            {actions.acknowledge ? <Button onClick={routerToAck}><CheckCircle2 className="mr-2 h-4 w-4" /> Acknowledge</Button> : null}
            {actions.retryPdf ? (
              <Button variant="outline" onClick={retryPdf} disabled={busy === "pdf"} aria-label="Retry PDF generation">
                {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Retry PDF
              </Button>
            ) : null}
            {actions.void ? <Button variant="destructive" onClick={() => setVoidOpen(true)}><Ban className="mr-2 h-4 w-4" /> Void</Button> : null}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Service information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Service Invoice</dt><dd className="font-medium">{report.serviceInvoiceNo || "Not linked"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Report type</dt><dd>{REPORT_TYPE_LABELS[report.reportType]}</dd></div>
            {field("Service date", report.serviceDate.slice(0, 10))}
            {isWaterTreatment ? <div><dt className="text-xs text-muted-foreground">Email</dt><dd>{display(details?.emailAddress)}</dd></div> : null}
            {field("Company", report.companyNameSnapshot)}
            {field("Client name", report.clientNameSnapshot)}
            {field("Client address", report.clientAddressSnapshot)}
            {field("Attended by", report.assignedTechnicianNameSnapshot)}
            {field("Service type", report.serviceType)}
            {field("Version", report.version)}
            {field("Updated", fmt(report.updatedAt))}
          </dl>
        </CardContent>
      </Card>

      {isWaterTreatment ? (
        <>
          {WATER_TREATMENT_MEASUREMENT_SECTIONS.map((section) => (
            <Card key={section.title}>
              <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {section.fields.map((pair) => (
                    <div key={pair.key} className="rounded-md border border-input p-3">
                      <p className="text-sm font-medium">{pair.label}</p>
                      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div><dt className="text-xs text-muted-foreground">Before</dt><dd className="tabular-nums">{display(wt[pair.beforeKey])}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">After</dt><dd className="tabular-nums">{display(wt[pair.afterKey])}</dd></div>
                      </dl>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader><CardTitle>Samples and equipment inspection</CardTitle></CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                {WATER_TREATMENT_SAMPLE_FIELDS.map((sample) => (
                  <div key={sample.key}>
                    <dt className="text-xs text-muted-foreground">{sample.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{display(wt[sample.key])}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex flex-col gap-2">
                {WATER_TREATMENT_EQUIPMENT_FIELDS.map((equipment) => (
                  <div key={equipment.key} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2">
                    <span className="text-sm">{equipment.label}</span>
                    <Badge variant={wt[equipment.key] === "DEFECTIVE" ? "destructive" : wt[equipment.key] === "WORKING" ? "default" : "outline"}>
                      {equipmentLabel(wt[equipment.key])}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Remarks and Recommendation</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs font-semibold text-muted-foreground">Remarks</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{display(wt.remarks)}</p>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">Recommendation</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{display(wt.recommendation)}</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader><CardTitle>Field report</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{report.fieldReport || "—"}</p>
            {report.remarks ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted-foreground">Remarks</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{report.remarks}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Customer acknowledgment</CardTitle></CardHeader>
        <CardContent>
          {report.acknowledgedByFullName ? (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Acknowledged by</dt><dd className="font-medium">{report.acknowledgedByFullName}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Position / department</dt><dd>{report.acknowledgedByPosition || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Signed at</dt><dd className="tabular-nums">{fmtSignedAt(report.signedAt)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">PDF status</dt><dd>{pdfStatusLabel(report.pdfGenerationStatus)}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Not acknowledged yet.</p>
          )}
          {report.signatureDriveFileId ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground">Customer signature</p>
              <div className="mt-1 overflow-hidden rounded-md border border-input bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SIGNATURE_PROXY + report.signatureDriveFileId} alt="Drawn customer signature" className="h-28 w-full object-contain" />
              </div>
            </div>
          ) : null}
          {report.pdfGenerationStatus === "READY" && report.pdfDriveFileId ? (
            <div className="mt-4">
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" aria-label="Open the final Service Report PDF" onClick={() => window.open(`/api/service-reports/${encodeURIComponent(report.serviceReportId)}/pdf`, "_blank", "noopener,noreferrer")}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Open the final PDF
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          {detail.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {detail.history.slice().reverse().map((event) => (
                <li key={event.eventId} className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{event.eventType}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{fmt(event.createdAt)}</span>
                  </div>
                  {event.fromStatus || event.toStatus ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      {event.fromStatus ? `${event.fromStatus} → ` : ""}{event.toStatus}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Void this Service Report?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Void reason (required)</Label>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Why is this report invalid?" aria-label="Void reason" />
            <p className="text-xs text-muted-foreground">Voiding removes the report from the active set, allowing a replacement to be created.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voiding}>Cancel</Button>
            <Button variant="destructive" onClick={confirmVoid} disabled={voiding || !voidReason.trim()}>
              {voiding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {voiding ? "Voiding..." : "Void report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

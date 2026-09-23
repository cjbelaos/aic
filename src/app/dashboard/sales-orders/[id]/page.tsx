"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/logo-loader";
import { ArrowLeft, CheckCircle2, CirclePause, CirclePlay, Pencil, RefreshCw, XCircle } from "lucide-react";
import salesOrderService, { type SalesOrderDetail } from "@/lib/services/sales-order.service";
import { money, formatDate, orderStatusBadge, fulfillmentBadge, syncBadge } from "@/components/sales-orders/badges";

export default function SalesOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return <DetailInner orderId={params?.id ?? ""} />;
}

function DetailInner({ orderId }: { orderId: string }) {
  const [detail, setDetail] = React.useState<SalesOrderDetail | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  const refresh = React.useCallback(async () => {
    setError("");
    try {
      const result = await salesOrderService.get(orderId);
      setDetail({ ...result, order: result.order, items: result.items, history: result.history, documents: result.documents, fulfillments: result.fulfillments, documentLinks: result.documentLinks, syncJobs: result.syncJobs, totals: result.totals, category: result.category });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load the sales order.");
    }
  }, [orderId]);

  React.useEffect(() => {
    void Promise.resolve().then(() => { void refresh(); });
  }, [refresh]);

  const run = React.useCallback(async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await fn();
      setNotice(`${label} succeeded.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Failed: ${label}`);
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  if (error && !detail) return <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">{error}</p>;
  if (!detail) return <PageLoader label="Loading sales order…" />;
  const order = detail.order;
  const version = order.version;
  const latestSync = detail.syncJobs.length > 0 ? detail.syncJobs[detail.syncJobs.length - 1] : null;
  const syncStatus = latestSync ? latestSync.status : "NONE";
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{order.salesOrderNo || "Sales Order Draft"}</h1>
          <p className="text-sm text-muted-foreground">
            {order.orderStatus === "DRAFT" ? "Not yet numbered" : `Version ${version}`}
            {order.legacyTrackerNo ? ` · Legacy #${order.legacyTrackerNo}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {orderStatusBadge(order.orderStatus)}
          {fulfillmentBadge(order.fulfillmentStatus)}
          {syncBadge(syncStatus)}
          <Button asChild variant="outline"><Link href={`/dashboard/sales-orders/${orderId}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sales-orders"><ArrowLeft className="mr-2 h-4 w-4" />Back to List</Link></Button>
        </div>
      </div>
      {notice ? <p role="status" className="text-sm text-emerald-600">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {order.orderStatus === "DRAFT" ? <ActionButton label="Confirm Order" icon={<CheckCircle2 />} busy={busy} onRun={() => run("Confirm", () => salesOrderService.confirm(orderId, version))} /> : null}
        {order.orderStatus === "CONFIRMED" ? <ActionButton label="Place on Hold" icon={<CirclePause />} variant="outline" busy={busy} onRun={() => run("Hold", () => salesOrderService.hold(orderId, version))} /> : null}
        {order.orderStatus === "ON_HOLD" ? <ActionButton label="Resume Order" icon={<CirclePlay />} variant="outline" busy={busy} onRun={() => run("Resume", () => salesOrderService.resume(orderId, version))} /> : null}
        {order.orderStatus === "CONFIRMED" || order.orderStatus === "ON_HOLD" ? <ActionButton label="Cancel Remaining" icon={<XCircle />} variant="destructive" busy={busy} onRun={() => run("Cancel", () => cancelWith(orderId, version))} /> : null}
        {order.orderStatus === "CONFIRMED" ? <ActionButton label="Close Order" icon={<CheckCircle2 />} variant="outline" busy={busy} onRun={() => run("Close", () => salesOrderService.close(orderId, version, "Administrative close"))} /> : null}
        {latestSync && (syncStatus === "FAILED" || syncStatus === "RETRY") ? <ActionButton label="Retry Sync" icon={<RefreshCw />} variant="outline" busy={busy} onRun={() => run("Retry sync", () => salesOrderService.retrySync(orderId))} /> : null}
      </div>
      <Card className="gap-3">
        <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <div><span className="text-muted-foreground">Customer: </span>{order.customerNameSnapshot || order.customerId}</div>
          <div><span className="text-muted-foreground">Received: </span>{formatDate(order.receivedDate)}</div>
          <div><span className="text-muted-foreground">Required: </span>{formatDate(order.requiredDate)}</div>
          <div><span className="text-muted-foreground">Customer PO: </span>{order.customerPONo || "—"}</div>
          <div><span className="text-muted-foreground">Terms: </span>{order.paymentTermsSnapshot || "—"}</div>
          <div><span className="text-muted-foreground">Category: </span>{detail.category || "—"}</div>
          {order.cancelReason ? <div><span className="text-muted-foreground">Cancel reason: </span>{order.cancelReason}</div> : null}
          <div><span className="text-muted-foreground">Remarks: </span>{order.remarks || "—"}</div>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Totals (server-recalculated)</p>
          <div className="flex flex-col gap-1 md:flex-row md:justify-between">
            <span>Subtotal (ex VAT): {money(detail.totals.subtotalExTax)}</span>
            <span>Discounts: {money(detail.totals.discountTotal)}</span>
            <span>VAT: {money(detail.totals.taxTotal)}</span>
            <strong>Grand total: {money(detail.totals.grandTotal)}</strong>
          </div>
        </CardContent>
      </Card>
      <ItemsSection detail={detail} orderId={orderId} expectedVersion={version} run={run} busy={busy} />
      <SyncSection detail={detail} />
      <DocumentsSection detail={detail} orderId={orderId} expectedVersion={version} run={run} busy={busy} />
      <ActivitySection detail={detail} />
    </div>
  );
}

function cancelWith(orderId: string, version: number): Promise<unknown> {
  const reason = window.prompt("Cancel reason (required):");
  if (reason === null) return Promise.reject(new Error("Cancellation aborted."));
  if (!reason.trim()) return Promise.reject(new Error("A cancel reason is required."));
  return salesOrderService.cancel(orderId, version, reason);
}

function ActionButton(props: { label: string; icon?: React.ReactNode; variant?: "default" | "outline" | "destructive" | "secondary" | "ghost" | "link"; busy: boolean; onRun: () => Promise<void> }): React.ReactNode {
  return <Button variant={props.variant} disabled={props.busy} onClick={() => void props.onRun()}>{props.icon}{props.label}</Button>;
}
function ItemsSection(props: { detail: SalesOrderDetail; orderId: string; expectedVersion: number; run: (label: string, fn: () => Promise<unknown>) => Promise<void>; busy: boolean }): React.ReactNode {
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle>Items & Fulfillment</CardTitle></CardHeader>
      <CardContent>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm">
          <thead><tr className="text-left"><th>Line</th><th>Description</th><th>Type</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Line total</th><th className="text-right">Fulfilled</th><th className="text-right">Cancelled</th></tr></thead>
          <tbody>
            {props.detail.items.map((item) => (
              <tr key={item.salesOrderItemId} className="border-b">
                <td>{item.lineNo}</td>
                <td>{item.description}{item.productCodeSnapshot ? <span className="block text-xs text-muted-foreground">{item.productCodeSnapshot}</span> : null}</td>
                <td>{item.lineType} · <span className="text-xs text-muted-foreground">{item.priceSource}</span></td>
                <td className="text-right">{item.quantity ?? "unknown"}</td>
                <td className="text-right">{item.unitPrice === null ? "unknown" : money(item.unitPrice)}</td>
                <td className="text-right">{money(item.lineTotal)}</td>
                <td className="text-right">{item.fulfilledQty}</td>
                <td className="text-right">{item.cancelledQty}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="space-y-3 md:hidden">
          {props.detail.items.map((item) => <article key={item.salesOrderItemId} className="rounded-lg border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">Line {item.lineNo} · {item.productCodeSnapshot || item.lineType}</p></div><strong className="tabular-nums">{money(item.lineTotal)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Quantity</dt><dd>{item.quantity ?? "Unknown"} {item.unitSnapshot}</dd></div><div><dt className="text-xs text-muted-foreground">Unit price</dt><dd>{item.unitPrice === null ? "Unknown" : money(item.unitPrice)}</dd></div><div><dt className="text-xs text-muted-foreground">Fulfilled</dt><dd>{item.fulfilledQty}</dd></div><div><dt className="text-xs text-muted-foreground">Cancelled</dt><dd>{item.cancelledQty}</dd></div></dl></article>)}
        </div>
        <FulfillmentEvidenceGuidance detail={props.detail} />
      </CardContent>
    </Card>
  );
}

function FulfillmentEvidenceGuidance(props: { detail: SalesOrderDetail }): React.ReactNode {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-sm font-medium">Fulfillment evidence</p>
      <p className="text-sm text-muted-foreground">Product quantities are posted only from a finalized Delivery Release linked to this Sales Order. Service quantities are posted only from a finalized Service Report linked to its Service Invoice and this Sales Order.</p>
      {props.detail.fulfillments.filter((entry) => entry.status !== "REVERSED").map((entry) => (
        <p key={entry.fulfillmentId} className="text-xs text-muted-foreground">
          {entry.fulfillmentType} qty {entry.quantity} on line {entry.salesOrderItemId.slice(0, 8)} ({formatDate(entry.effectiveDate)})
        </p>
      ))}
    </div>
  );
}

function SyncSection({ detail }: { detail: SalesOrderDetail }): React.ReactNode {
  const latest = detail.syncJobs.length > 0 ? detail.syncJobs[detail.syncJobs.length - 1] : null;
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle>Synchronization</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {latest ? (
          <div className="flex flex-col gap-1">
            <span>Status: {syncBadge(latest.status)}</span>
            <span>Order version {latest.orderVersion} · attempts {latest.attemptCount} · last attempt {formatDate(latest.lastAttemptAt)}</span>
            {latest.lastErrorCode ? <span className="text-muted-foreground">{latest.lastErrorCode}: {latest.lastErrorMessage}</span> : null}
          </div>
        ) : (
          <p className="text-muted-foreground">No outbound synchronization job yet — sync is enabled only after Phase 1 gates pass and a staging destination is authorized.</p>
        )}
      </CardContent>
    </Card>
  );
}
function DocumentsSection(props: { detail: SalesOrderDetail; orderId: string; expectedVersion: number; run: (label: string, fn: () => Promise<unknown>) => Promise<void>; busy: boolean }): React.ReactNode {
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {props.detail.documents.map((doc) => (
          <p key={doc.documentId} className="text-sm">
            {doc.documentType} · {doc.fileName || doc.externalDocumentNo || doc.driveFileId}
            {doc.externalUrl ? <a className="ml-1 text-primary underline" href={doc.externalUrl} target="_blank" rel="noreferrer">open</a> : null}
            <span className="text-xs text-muted-foreground"> · v{doc.orderVersion} · {doc.generationStatus}</span>
          </p>
        ))}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          const data = new FormData(form);
          const type = String(data.get("type"));
          const file = data.get("file");
          if (!type || !(file instanceof File) || file.size === 0) return;
          void props.run("Upload document", () => salesOrderService.uploadDocument(props.orderId, {
            documentType: type, file, orderVersion: props.expectedVersion,
          }).then((result) => { form.reset(); return result; }));
        }}>
          <select name="type" aria-label="Document type" className="rounded-md border border-input bg-transparent px-2 py-1.5 text-sm">
            <option value="CUSTOMER_PO">Customer PO</option>
            <option value="QUOTATION">Quotation</option>
            <option value="SERVICE_REPORT">Service report</option>
            <option value="OTHER">Other</option>
          </select>
          <Input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" aria-label="Document file" />
          <Button type="submit" variant="outline" size="sm" disabled={props.busy}>Upload</Button>
        </form>
        <Button variant="outline" size="sm" disabled={props.busy} onClick={() => {
          void props.run("Generate PDF", () => salesOrderService.generatePdf(props.orderId).then((result) => {
            if (!result.artifact || !result.artifact.pdf) return;
            const bytes = atob(result.artifact.pdf);
            const data = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i);
            const blob = new Blob([data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = result.artifact.fileName;
            anchor.click();
            URL.revokeObjectURL(url);
          }));
        }}>Generate PDF</Button>
      </CardContent>
    </Card>
  );
}

function ActivitySection({ detail }: { detail: SalesOrderDetail }): React.ReactNode {
  const history = [...detail.history].reverse();
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {history.length === 0 ? <p className="text-muted-foreground">No activity recorded.</p> : null}
        {history.map((entry) => (
          <div key={entry.eventId} className="flex flex-col gap-0.5">
            <p className="font-medium">{entry.eventType} <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)} by {entry.actorUserId}</span></p>
            {entry.reason ? <p className="text-xs text-muted-foreground">{entry.reason}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

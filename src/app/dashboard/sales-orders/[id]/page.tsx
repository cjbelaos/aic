"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/logo-loader";
import { ArrowLeft, CheckCircle2, CirclePause, CirclePlay, FileText, Pencil, ReceiptText, Truck, XCircle } from "lucide-react";
import salesOrderService, { type SalesOrderBilling, type SalesOrderDetail } from "@/lib/services/sales-order.service";
import type { SalesOrderItem } from "@/types/salesOrder";
import type { ProformaInvoice } from "@/types/proformaInvoice";
import { salesOrderQuotationDisplay } from "@/lib/salesOrders/quotationReference";
import { isNotPricedLine, priceSourceLabel } from "@/lib/salesOrders/domain";
import { BILLING_TYPE_LABELS } from "@/lib/salesOrders/billing";
import { useDashboardPageTitle } from "@/components/dashboard-page-title";
import { money, formatDate, orderStatusBadge, fulfillmentBadge } from "@/components/sales-orders/badges";
/**
 * A descriptive line of a single-total quotation carries no price of its own:
 * show that clearly instead of a misleading zero.
 */
function lineAmount(item: Pick<SalesOrderItem, "priceSource" | "lineTotal" | "unitPrice">): React.ReactNode {
  if (isNotPricedLine(item)) return <span className="text-sm font-normal text-muted-foreground">Included in combined total</span>;
  return item.unitPrice === null && item.lineTotal === 0 ? "unknown" : money(item.lineTotal);
}


export default function SalesOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return <DetailInner orderId={params?.id ?? ""} />;
}

function DetailInner({ orderId }: { orderId: string }) {
  const [detail, setDetail] = React.useState<SalesOrderDetail | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [billing, setBilling] = React.useState<SalesOrderBilling | null>(null);
  const [billingError, setBillingError] = React.useState("");
  useDashboardPageTitle(detail?.order.salesOrderNo);

  const refresh = React.useCallback(async () => {
    setError("");
    // Billing loads beside the order; its failure must not hide the order itself.
    void salesOrderService.billing(orderId)
      .then((result) => { setBilling(result); setBillingError(""); })
      .catch((caught) => setBillingError(caught instanceof Error ? caught.message : "Failed to load linked documents."));
    try {
      const result = await salesOrderService.get(orderId);
      setDetail({ ...result, order: result.order, items: result.items, history: result.history, documents: result.documents, fulfillments: result.fulfillments, documentLinks: result.documentLinks, totals: result.totals, category: result.category });
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
  const hasUndeliveredProducts = detail.items.some((item) => item.lineType === "PRODUCT" && item.lineStatus === "ACTIVE" && item.quantity !== null && item.quantity > item.fulfilledQty + item.cancelledQty);
  const open = order.orderStatus === "CONFIRMED" || order.orderStatus === "ON_HOLD";
  const fulfilled = order.fulfillmentStatus === "FULFILLED";
  const readyToClose = order.orderStatus === "CONFIRMED" && fulfilled && !!billing?.progress.fullyInvoiced;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{order.salesOrderNo || (order.orderStatus === "DRAFT" ? "Sales Order Draft" : "Sales Order number pending")}</h1>
          <p className="text-sm text-muted-foreground">
            {order.orderStatus === "DRAFT" ? "Not yet numbered" : `Version ${version}`}
            {order.legacyTrackerNo ? ` · Legacy #${order.legacyTrackerNo}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {orderStatusBadge(order.orderStatus)}
          {fulfillmentBadge(order.fulfillmentStatus)}
          <Button asChild variant="outline"><Link href={`/dashboard/sales-orders/${orderId}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sales-orders"><ArrowLeft className="mr-2 h-4 w-4" />Back to List</Link></Button>
        </div>
      </div>
      {notice ? <p role="status" className="text-sm text-emerald-600">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {order.orderStatus === "DRAFT" ? <ActionButton label="Confirm Order" icon={<CheckCircle2 />} busy={busy} onRun={() => run("Confirm", () => salesOrderService.confirm(orderId, version))} /> : null}
        {/* Nothing is left to hold or cancel once every line is delivered. */}
        {order.orderStatus === "CONFIRMED" && !fulfilled ? <ActionButton label="Place on Hold" icon={<CirclePause />} variant="outline" busy={busy} onRun={() => run("Hold", () => salesOrderService.hold(orderId, version))} /> : null}
        {order.orderStatus === "ON_HOLD" ? <ActionButton label="Resume Order" icon={<CirclePlay />} variant="outline" busy={busy} onRun={() => run("Resume", () => salesOrderService.resume(orderId, version))} /> : null}
        {open && !fulfilled ? <ActionButton label="Cancel Remaining" icon={<XCircle />} variant="destructive" busy={busy} onRun={() => run("Cancel", () => cancelWith(orderId, version))} /> : null}
        {order.orderStatus === "CONFIRMED" ? <ActionButton label="Close Order" icon={<CheckCircle2 />} variant={readyToClose ? "default" : "outline"} busy={busy} onRun={() => run("Close", () => salesOrderService.close(orderId, version, readyToClose ? "Delivered and fully invoiced" : "Administrative close"))} /> : null}
      </div>
      {readyToClose ? <p role="status" className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">Delivered and fully invoiced. This order is ready to close.</p> : null}
      <Card className="gap-3">
        <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <div><span className="text-muted-foreground">Customer: </span>{order.customerNameSnapshot || order.customerId}</div>
          <div><span className="text-muted-foreground">Received: </span>{formatDate(order.receivedDate)}</div>
          <div><span className="text-muted-foreground">Required: </span>{formatDate(order.requiredDate)}</div>
          <div><span className="text-muted-foreground">Customer PO: </span>{order.customerPONo || "—"}</div>
          <div><span className="text-muted-foreground">Quotation No.: </span>{salesOrderQuotationDisplay(order) || "—"}</div>
          <div><span className="text-muted-foreground">Terms: </span>{order.paymentTermsSnapshot || "—"}</div>
          <div><span className="text-muted-foreground">Category: </span>{detail.category || "—"}</div>
          <div><span className="text-muted-foreground">Billing type: </span>{billing ? BILLING_TYPE_LABELS[billing.billingType] : "—"}</div>
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
      <LinkedDocumentsCard
        orderId={orderId}
        billing={billing}
        billingError={billingError}
        canCreateDeliveryReceipt={order.orderStatus === "CONFIRMED" && hasUndeliveredProducts}
        canCreateInvoice={open && !!billing && !billing.progress.fullyInvoiced}
        canCreateProforma={!["DRAFT", "CANCELLED"].includes(order.orderStatus)}
      />
      <ActivitySection detail={detail} />
    </div>
  );
}

type DocumentRow = { key: string; type: "DR" | "SR" | "SI" | "Proforma"; number: string; href: string; date: string; status: string; payment?: string; amount?: number };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  printed: "default", created: "outline", draft: "secondary", paid: "default", issued: "outline",
  full: "default", partial: "secondary", unpaid: "destructive",
};
const PAYMENT_LABEL: Record<string, string> = { full: "Paid", partial: "Partially paid", unpaid: "Unpaid" };

function StatusBadge({ value, label }: { value: string; label?: string }): React.ReactNode {
  const key = value.toLowerCase();
  return <Badge variant={STATUS_VARIANT[key] ?? "outline"} className="capitalize">{label ?? key.replaceAll("_", " ")}</Badge>;
}

function LinkedDocumentsCard(props: {
  orderId: string;
  billing: SalesOrderBilling | null;
  billingError: string;
  canCreateDeliveryReceipt: boolean;
  canCreateInvoice: boolean;
  canCreateProforma: boolean;
}): React.ReactNode {
  const { orderId, billing } = props;
  const [proformas, setProformas] = React.useState<ProformaInvoice[]>([]);
  React.useEffect(() => {
    let active = true;
    void fetch(`/api/proforma-invoices?salesOrderId=${encodeURIComponent(orderId)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: ProformaInvoice[]) => { if (active) setProformas(Array.isArray(data) ? data : []); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [orderId]);

  const invoiceLabel = billing?.billingType === "SALES_INVOICE" ? "SI" : "SR";
  const invoicePage = billing?.billingType === "SALES_INVOICE" ? "sales-invoices" : "service-invoices";
  const rows: DocumentRow[] = [
    ...(billing?.deliveryReceipts ?? []).map((dr): DocumentRow => ({ key: `DR-${dr.drNumber}`, type: "DR", number: `#${dr.drNumber}`, href: `/dashboard/delivery-releases?view=${dr.drNumber}`, date: dr.date, status: dr.status })),
    ...(billing?.invoices ?? []).map((invoice): DocumentRow => ({
      key: `${invoice.invoiceKind}-${invoice.invoiceNo}`,
      type: invoice.invoiceKind === "sales" ? "SI" : "SR",
      number: `#${invoice.invoiceNo}`,
      href: `/dashboard/${invoice.invoiceKind}-invoices?view=${encodeURIComponent(invoice.invoiceNo)}`,
      date: invoice.date, status: invoice.status, payment: invoice.paymentStatus, amount: invoice.total,
    })),
    ...proformas.map((proforma): DocumentRow => ({ key: `PF-${proforma.id}`, type: "Proforma", number: proforma.invoiceNo || "Draft", href: `/dashboard/proforma-invoices?invoiceId=${encodeURIComponent(proforma.id)}`, date: proforma.date, status: proforma.status, amount: proforma.totalAmount })),
  ];

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Linked Documents</CardTitle>
          {billing ? (
            <p className="text-sm text-muted-foreground">
              Invoiced <span className="font-medium text-foreground tabular-nums">{money(billing.progress.invoiced)}</span> of {money(billing.progress.orderTotal)}
              {billing.progress.fullyInvoiced ? " · fully invoiced" : ` · ${money(billing.progress.remaining)} remaining`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {props.canCreateDeliveryReceipt ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/delivery-releases?salesOrderId=${encodeURIComponent(orderId)}`}><Truck />Create DR</Link></Button> : null}
          {props.canCreateInvoice ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/${invoicePage}?salesOrderId=${encodeURIComponent(orderId)}`}><ReceiptText />Create {invoiceLabel}</Link></Button> : null}
          {props.canCreateProforma ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/proforma-invoices?salesOrderId=${encodeURIComponent(orderId)}`}><FileText />Create Proforma</Link></Button> : null}
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {props.billingError ? <p role="alert" className="text-destructive">{props.billingError}</p>
          : !billing ? <p className="text-muted-foreground">Loading linked documents…</p>
          : rows.length === 0 ? <p className="text-muted-foreground">No DR, invoice or proforma yet.</p>
          : (
            <>
              <table className="hidden w-full md:table">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Type</th><th className="font-medium">No.</th><th className="font-medium">Date</th><th className="font-medium">Status</th><th className="font-medium">Payment</th><th className="text-right font-medium">Amount</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t">
                      <td className="py-2 text-muted-foreground">{row.type}</td>
                      <td><Link className="font-medium text-primary underline-offset-4 hover:underline" href={row.href}>{row.number}</Link></td>
                      <td className="tabular-nums">{formatDate(row.date)}</td>
                      <td><StatusBadge value={row.status} /></td>
                      <td>{row.payment ? <StatusBadge value={row.payment} label={PAYMENT_LABEL[row.payment]} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="text-right tabular-nums">{row.amount === undefined ? <span className="text-muted-foreground">—</span> : money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <span>
                      <span className="text-muted-foreground">{row.type} </span>
                      <Link className="font-medium text-primary" href={row.href}>{row.number}</Link>
                      <span className="block text-xs text-muted-foreground">{formatDate(row.date)}{row.amount === undefined ? "" : ` · ${money(row.amount)}`}</span>
                    </span>
                    <span className="flex gap-1"><StatusBadge value={row.status} />{row.payment ? <StatusBadge value={row.payment} label={PAYMENT_LABEL[row.payment]} /> : null}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
      </CardContent>
    </Card>
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
                <td>{item.lineType} · <span className="text-xs text-muted-foreground">{priceSourceLabel(item.priceSource)}</span></td>
                <td className="text-right">{item.quantity ?? "unknown"}</td>
                <td className="text-right">{isNotPricedLine(item) ? "Included" : item.unitPrice === null ? "unknown" : money(item.unitPrice)}</td>
                <td className="text-right">{isNotPricedLine(item) ? <span className="text-xs text-muted-foreground">Included in combined total</span> : money(item.lineTotal)}</td>
                <td className="text-right">{item.fulfilledQty}</td>
                <td className="text-right">{item.cancelledQty}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="space-y-3 md:hidden">
          {props.detail.items.map((item) => <article key={item.salesOrderItemId} className="rounded-lg border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">Line {item.lineNo} · {item.productCodeSnapshot || item.lineType}</p></div><strong className="tabular-nums">{lineAmount(item)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Quantity</dt><dd>{item.quantity ?? "Unknown"} {item.unitSnapshot}</dd></div><div><dt className="text-xs text-muted-foreground">Unit price</dt><dd>{lineAmount(item)}</dd></div><div><dt className="text-xs text-muted-foreground">Fulfilled</dt><dd>{item.fulfilledQty}</dd></div><div><dt className="text-xs text-muted-foreground">Cancelled</dt><dd>{item.cancelledQty}</dd></div></dl></article>)}
        </div>
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
            <p className="font-medium">{entry.eventType} <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)} by {entry.actorFullName || entry.actorUserId}</span></p>
            {entry.reason ? <p className="text-xs text-muted-foreground">{entry.reason}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

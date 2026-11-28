"use client";
import { useEffect, useState } from "react";
import salesOrderService, { type SalesOrderBilling, type SalesOrderDetail } from "@/lib/services/sales-order.service";
import type { DiscountSettings } from "@/lib/discounts";
import { invoiceTotals, resolveInvoiceDiscount } from "@/lib/serviceInvoiceDiscounts";
import { invoiceTally } from "@/lib/salesOrders/billing";
import type { ServiceInvoiceItem } from "@/types/serviceInvoice";

const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Items total for the invoice being edited, tallied against its Sales Order's unbilled balance. */
export function InvoiceItemsTally({ orderId, items, discountSettings, invoiceKind, invoiceNo }: {
  orderId?: string;
  items: ServiceInvoiceItem[];
  discountSettings: DiscountSettings;
  invoiceKind: "service" | "sales";
  /** The saved invoice's number, so it isn't counted as "billed elsewhere". Omit for a new invoice. */
  invoiceNo?: string;
}) {
  const [source, setSource] = useState<{ orderId: string; detail: SalesOrderDetail; billing: SalesOrderBilling } | null>(null);
  const [failedOrderId, setFailedOrderId] = useState("");
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    Promise.all([salesOrderService.get(orderId), salesOrderService.billing(orderId)])
      .then(([detail, billing]) => { if (active) setSource({ orderId, detail, billing }); })
      .catch(() => { if (active) setFailedOrderId(orderId); });
    return () => { active = false; };
  }, [orderId]);

  const current = orderId && source?.orderId === orderId ? source : undefined;
  let totals: ReturnType<typeof invoiceTotals> | undefined;
  try {
    const resolved = resolveInvoiceDiscount(items, orderId ? undefined : discountSettings, current?.detail, invoiceKind);
    totals = invoiceTotals({ items, discountAmount: resolved.discountAmount });
  } catch {
    totals = invoiceTotals({ items });
  }
  const tally = current && totals
    ? invoiceTally(current.billing.progress.orderTotal, current.billing.invoices, { invoiceKind, invoiceNo }, totals.grandTotal)
    : undefined;
  const lineCount = items.filter((item) => item.description.trim()).length;

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2" aria-live="polite">
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 tabular-nums">
        <span className="text-muted-foreground">Items total ({lineCount} {lineCount === 1 ? "line" : "lines"}): <span className="text-foreground">{peso(totals.subtotal)}</span></span>
        {totals.discount > 0 && <span className="text-muted-foreground">Less discount: <span className="text-foreground">{peso(totals.discount)}</span></span>}
        <span className="font-semibold">Invoice total: {peso(totals.grandTotal)}</span>
      </div>
      {orderId && !current && (
        <p className="text-xs text-muted-foreground">
          {failedOrderId === orderId ? "Unable to load the Sales Order balance to compare." : "Loading Sales Order balance…"}
        </p>
      )}
      {current && tally && (
        <div className="border-t pt-2 space-y-1">
          <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums text-muted-foreground">
            <span>Sales Order {current.detail.order.salesOrderNo} total: <span className="text-foreground">{peso(tally.orderTotal)}</span></span>
            <span>Billed on other invoices: <span className="text-foreground">{peso(tally.billedElsewhere)}</span></span>
            <span>Remaining to bill: <span className="text-foreground">{peso(tally.remaining)}</span></span>
          </div>
          {tally.status === "match" && <p className="text-emerald-600 dark:text-emerald-400">✓ Tallied: this invoice matches the remaining balance.</p>}
          {tally.status === "under" && <p className="text-amber-600 dark:text-amber-400">This invoice is {peso(-tally.difference)} below the remaining balance (partial billing).</p>}
          {tally.status === "over" && <p role="alert" className="text-destructive">This invoice is {peso(tally.difference)} over the remaining balance and can&apos;t be saved.</p>}
        </div>
      )}
    </div>
  );
}

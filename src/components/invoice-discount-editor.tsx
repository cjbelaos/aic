"use client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { DiscountInput } from "./discount-input";
import salesOrderService, { type SalesOrderDetail } from "@/lib/services/sales-order.service";
import { defaultDiscount, type DiscountSettings } from "@/lib/discounts";
import { invoiceTotals, resolveInvoiceDiscount } from "@/lib/serviceInvoiceDiscounts";
import type { ServiceInvoiceItem } from "@/types/serviceInvoice";

export function InvoiceDiscountEditor({ orderId, items, value, onChange, onSelectLine }: {
  orderId?: string; items: ServiceInvoiceItem[]; value: DiscountSettings; onChange: (value: DiscountSettings) => void;
  onSelectLine: (index: number, id: string) => void;
}) {
  const [source, setSource] = useState<SalesOrderDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    salesOrderService.get(orderId).then(detail => { if (active) { setSource(detail); setError(""); } }).catch(() => { if (active) setError("Unable to load Sales Order discounts. Try reopening the invoice."); });
    return () => { active = false; };
  }, [orderId]);
  const current = source && source.order.salesOrderId === orderId ? source : undefined;
  let totals;
  let calculationError = "";
  try {
    const resolved = resolveInvoiceDiscount(items, orderId ? undefined : value, current);
    totals = invoiceTotals({ items, discountAmount: resolved.discountAmount });
  } catch (caught) { calculationError = caught instanceof Error ? caught.message : "Invalid discount."; }
  return <div className="space-y-2">
    {orderId ? current ? <><DiscountInput value={current.order.discountSettings ?? { ...defaultDiscount(), mode: current.items.some(item => item.discountAmount) ? "PER_ITEM" : "OVERALL" }} onChange={() => {}} disabled showMode /><p className="text-xs text-muted-foreground">Inherited from Sales Order; read-only. Partial invoices receive a proportional discount.</p></> : <p className="text-sm">{error || "Loading Sales Order discounts…"}</p> : <DiscountInput value={value} onChange={onChange} />}
    {current && (current.order.discountSettings?.mode === "PER_ITEM" || (!current.order.discountSettings && current.items.some(item => item.discountAmount))) && items.map((item, index) => <label key={index} className="block text-xs">Sales Order item for {item.description || `line ${index + 1}`}<Select value={item.salesOrderItemId || ""} onValueChange={selected => onSelectLine(index, selected)}><SelectTrigger aria-label={`Sales Order discount source line ${index + 1}`} className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="">Match by product / description</SelectItem>{current.items.filter(line => line.lineStatus === "ACTIVE" && line.priceSource !== "NOT_PRICED").map(line => <SelectItem key={line.salesOrderItemId} value={line.salesOrderItemId}>{line.lineNo}. {line.description}</SelectItem>)}</SelectContent></Select></label>)}
    {calculationError && <p role="alert" className="text-sm text-destructive">{calculationError}</p>}
    {totals && (!orderId || current) && <div className="text-sm">Less Discount: ₱{totals.discount.toFixed(2)} · VAT: ₱{totals.vat.toFixed(2)} · Final payable: ₱{totals.grandTotal.toFixed(2)}</div>}
  </div>;
}

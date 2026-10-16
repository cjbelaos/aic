"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProformaInvoice } from "@/types/proformaInvoice";
export function SalesOrderProformaSummary({ orderId, canCreate }: { orderId: string; canCreate: boolean }) {
  const [invoices, setInvoices] = useState<ProformaInvoice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch(`/api/proforma-invoices?salesOrderId=${encodeURIComponent(orderId)}`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load proformas.");
      if (active) setInvoices(data);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Unable to load proformas."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId]);
  return <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Proforma Invoices</CardTitle>{canCreate && <Button variant="outline" asChild><Link href={`/dashboard/proforma-invoices?salesOrderId=${encodeURIComponent(orderId)}`}>New Proforma</Link></Button>}</CardHeader><CardContent className="space-y-2 text-sm">{error ? <p role="alert" className="text-destructive">{error}</p> : loading ? <p>Loading proformas…</p> : invoices.length ? invoices.map(invoice => <div key={invoice.id} className="flex flex-wrap justify-between gap-2"><Link className="text-primary underline" href={`/dashboard/proforma-invoices?invoiceId=${encodeURIComponent(invoice.id)}`}>{invoice.invoiceNo || "Draft"}</Link><span>{invoice.status} · ₱ {invoice.totalAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>) : <p className="text-muted-foreground">No proformas for this Sales Order.</p>}</CardContent></Card>;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Printer, Download, Save, Upload, Eye, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityTable } from "@/components/ui/entity-table";
import { DocumentRegisterHeader } from "@/components/document-register-header";
import { BusinessDocumentPrintFrame, type BusinessDocumentPrintHandle } from "@/components/business-document-print-frame";
import { ProformaInvoicePrintDocument } from "@/components/proforma-invoice-print-document";
import { resolveUserSignatureUrls, type UserSignatureUrls } from "@/lib/userSignatures";
import { priceProformaItems } from "@/lib/proforma/domain";
import type { ProformaInput, ProformaInvoice } from "@/types/proformaInvoice";
import type { SalesOrder, SalesOrderItem } from "@/types/salesOrder";

const money = (value: number) => value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to process the Proforma Invoice.";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/proforma-invoices${url}`, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
type OrderOption = { id: string; number: string; trNo: string; customer: string; total: number };
type OrderDetail = { order: SalesOrder; sourceItems: SalesOrderItem[]; items: ProformaInvoice["items"]; issuedAmount: number; availableAmount: number };
const selectStyle = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export default function ProformaInvoicesPage() {
  const [invoices, setInvoices] = useState<ProformaInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ProformaInput | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<ProformaInvoice | null>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const orderRequest = useRef(0);
  const [preview, setPreview] = useState<ProformaInvoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProformaInvoice | null>(null);
  const [signatureUrls, setSignatureUrls] = useState<UserSignatureUrls>({});
  const printFrame = useRef<BusinessDocumentPrintHandle>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setInvoices(await request<ProformaInvoice[]>("")); } catch (error) { setError(errorText(error)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) setSignatureUrls({}); });
    if (preview) void resolveUserSignatureUrls([preview.preparedBy]).then(value => { if (active) setSignatureUrls(value); }).catch(() => {});
    return () => { active = false; };
  }, [preview]);
  const openForm = useCallback(async (invoice?: ProformaInvoice, orderId?: string) => {
    setBusy(true);
    try {
      const options = await request<{ orders: OrderOption[] }>("/options");
      setOrders(options.orders); setOrderSearch(""); setDetail(null);
      setEditingInvoice(invoice ?? null);
      if (invoice) {
        const selected = await request<OrderDetail>(`/options?salesOrderId=${encodeURIComponent(invoice.salesOrderId)}`);
        setDetail({ ...selected, availableAmount: selected.availableAmount + (invoice.status === "ISSUED" ? invoice.totalAmount : 0) });
        setForm({ id: invoice.id, expectedVersion: invoice.version, salesOrderId: invoice.salesOrderId, date: invoice.date, drNo: invoice.drNo, notes: invoice.notes, remarks: invoice.remarks, items: invoice.items });
      } else {
        const selected = orderId ? await request<OrderDetail>(`/options?salesOrderId=${encodeURIComponent(orderId)}`) : null;
        setDetail(selected);
        setForm({ id: crypto.randomUUID(), expectedVersion: 0, salesOrderId: selected?.order.salesOrderId || "", date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), drNo: "", notes: "", remarks: selected?.order.remarks || "", items: selected?.items || [] });
      }
    } catch (error) { toast.error(errorText(error)); } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("salesOrderId"), invoiceId = params.get("invoiceId");
    if (orderId) void Promise.resolve().then(() => openForm(undefined, orderId));
    else if (invoiceId) void request<ProformaInvoice>(`/${encodeURIComponent(invoiceId)}`).then(setPreview).catch(error => toast.error(errorText(error)));
  }, [openForm]);
  async function selectOrder(id: string) {
    const token = ++orderRequest.current;
    setOrderLoading(true); setDetail(null);
    setForm(previous => previous ? { ...previous, salesOrderId: id, items: [], remarks: "" } : null);
    try {
      const selected = await request<OrderDetail>(`/options?salesOrderId=${encodeURIComponent(id)}`);
      if (token !== orderRequest.current) return;
      setDetail(selected);
      setForm(previous => previous ? { ...previous, salesOrderId: id, items: selected.items, remarks: selected.order.remarks } : null);
    } catch (error) { if (token === orderRequest.current) toast.error(errorText(error)); } finally { if (token === orderRequest.current) setOrderLoading(false); }
  }
  const pricing = useMemo(() => {
    if (!form || !detail) return { items: [], error: "" };
    try { return { items: priceProformaItems(form.items, detail.sourceItems), error: "" }; }
    catch (error) {
      return { error: errorText(error), items: form.items.map(item => {
        try { return priceProformaItems([item], detail.sourceItems)[0]; }
        catch { return { ...item, discountAmount: 0, amount: 0 }; }
      }) };
    }
  }, [form, detail]);
  const priced = pricing.items;
  const total = priced.reduce((sum, item) => sum + item.amount, 0);
  async function save(issue: boolean) {
    if (!form || orderLoading) return;
    setBusy(true);
    try {
      const saved = await request<ProformaInvoice>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, issue }) });
      setForm({ ...form, expectedVersion: saved.version });
      if (saved.status === "ISSUED") {
        toast.success(editingInvoice?.status === "ISSUED" ? "Proforma updated in both sheets." : `Issued ${saved.invoiceNo}`);
        setPreview(saved);
      } else toast.success("Draft saved.");
      setForm(null); await load();
    } catch (error) { toast.error(errorText(error)); await load(); } finally { setBusy(false); }
  }
  const action = useCallback(async (invoice: ProformaInvoice, action: string) => {
    setBusy(true);
    try {
      const updated = await request<ProformaInvoice>(`/${invoice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedVersion: invoice.version }) });
      toast.success(action === "cancel" ? "Proforma cancelled." : "Proforma saved.");
      setPreview(previous => previous?.id === updated.id ? updated : previous); setCancelTarget(null); await load();
    } catch (error) { toast.error(errorText(error)); } finally { setBusy(false); }
  }, [load]);
  async function upload(file: File, kind: "pdf" | "scan") {
    if (!preview) return;
    const body = new FormData(); body.set("file", file); body.set("kind", kind); body.set("version", String(preview.version));
    const updated = await request<ProformaInvoice>(`/${preview.id}/files`, { method: "POST", body });
    setPreview(updated); await load(); toast.success(kind === "pdf" ? "PDF saved to Google Drive." : "Scanned copy uploaded.");
  }
  async function pdf(saveToDrive: boolean) {
    if (!preview) return;
    setBusy(true);
    try {
      const { generateBusinessDocumentPdf } = await import("@/lib/businessDocumentPdf");
      const base64 = await generateBusinessDocumentPdf(<ProformaInvoicePrintDocument invoice={preview} signatureUrls={signatureUrls} />);
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const file = new File([bytes], `${preview.invoiceNo || "Draft-Proforma"}.pdf`, { type: "application/pdf" });
      if (saveToDrive) await upload(file, "pdf");
      else { const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
    } catch (error) { toast.error(errorText(error)); } finally { setBusy(false); }
  }
  const columns = useMemo<ColumnDef<ProformaInvoice>[]>(() => [
    { accessorKey: "invoiceNo", header: "Proforma No.", cell: ({ row }) => <button className="font-medium text-primary underline" onClick={() => setPreview(row.original)}>{row.original.invoiceNo || "Draft"}</button> },
    { accessorKey: "date", header: "Date" }, { accessorKey: "companyName", header: "Customer" },
    { accessorKey: "salesOrderNo", header: "Sales Order / TR", cell: ({ row }) => <div>{row.original.salesOrderId ? <Link className="text-primary underline" href={`/dashboard/sales-orders/${row.original.salesOrderId}`}>{row.original.salesOrderNo}</Link> : "Unlinked"}<div className="text-xs text-muted-foreground">{row.original.trNo}</div></div> },
    { accessorKey: "totalAmount", header: "Total Amount", cell: ({ row }) => `₱ ${money(row.original.totalAmount)}` },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div>{row.original.status}{row.original.importIssue && <p className="text-xs text-muted-foreground" title={row.original.importIssue}>Migrated{row.original.importIssue.includes("REVIEW") ? " · Review needed" : ""}</p>}</div> },
    { accessorKey: "notes", header: "Notes" },
    { id: "actions", header: "Actions", cell: ({ row }) => <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" aria-label={`Preview ${row.original.invoiceNo || "draft"}`} onClick={() => setPreview(row.original)}><Eye className="size-4" /></Button>{(row.original.status === "DRAFT" || (row.original.status === "ISSUED" && !!row.original.salesOrderId)) && <Button size="sm" variant="outline" disabled={busy} aria-label="Edit proforma" onClick={() => void openForm(row.original)}><Pencil className="size-4" /></Button>}{row.original.status === "ISSUED" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelTarget(row.original)}>Cancel</Button>}</div> },
  ], [busy, openForm]);
  const visible = invoices.filter(invoice => (status === "ALL" || invoice.status === status) && [invoice.invoiceNo, invoice.companyName, invoice.salesOrderNo, invoice.trNo, invoice.notes].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-4 p-4 sm:p-6">
    <DocumentRegisterHeader eyebrow="Sales & Collections" title="Proforma Invoices" description="Prepare full or partial proformas from Sales Orders." loading={loading} actions={<><Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="size-4" />Refresh</Button><Button onClick={() => void openForm()} disabled={busy}><Plus className="size-4" />New Proforma</Button></>} cards={["ALL", "DRAFT", "ISSUED", "CANCELLED"].map(value => ({ label: value === "ALL" ? "All" : value.charAt(0) + value.slice(1).toLowerCase(), count: invoices.filter(invoice => value === "ALL" || invoice.status === value).length, selected: status === value, onClick: () => setStatus(value) }))} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Input aria-label="Search proformas" placeholder="Search proforma, customer, SO, TR or notes…" value={search} onChange={event => setSearch(event.target.value)} className="max-w-md" />
    <EntityTable title="Proforma Invoices" columns={columns} data={visible} loading={loading} hideHeader hideSearch hideTransferButtons getRowId={invoice => invoice.id} />
    <Dialog open={!!form} onOpenChange={open => { if (!open && !busy) { orderRequest.current++; setForm(null); } }}><DialogContent className="sm:max-w-5xl max-h-[92dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editingInvoice?.status === "ISSUED" ? `Edit ${editingInvoice.invoiceNo}` : form?.expectedVersion ? "Edit draft" : "New Proforma Invoice"}</DialogTitle><DialogDescription>Choose a Sales Order, then adjust items for this proforma. A number is assigned when issued.</DialogDescription></DialogHeader>
      {form && <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="order-search">Find Sales Order</Label><Input id="order-search" placeholder="Customer, SO or TR" value={orderSearch} onChange={event => setOrderSearch(event.target.value)} /><Label htmlFor="proforma-order">Sales Order *</Label><select id="proforma-order" className={selectStyle} value={form.salesOrderId} disabled={busy || editingInvoice?.status === "ISSUED"} onChange={event => void selectOrder(event.target.value)}><option value="" disabled>Select Sales Order</option>{orders.filter(order => order.id === form.salesOrderId || `${order.number} ${order.trNo} ${order.customer}`.toLowerCase().includes(orderSearch.toLowerCase())).map(order => <option key={order.id} value={order.id}>{order.number} · TR {order.trNo || "—"} · {order.customer}</option>)}</select></div>
          <div className="grid gap-3"><div><Label htmlFor="proforma-date">Date *</Label><Input id="proforma-date" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></div><div><Label htmlFor="proforma-dr">DR No. (optional)</Label><Input id="proforma-dr" value={form.drNo} onChange={event => setForm({ ...form, drNo: event.target.value })} /></div></div></div>
        {orderLoading && <p role="status">Loading Sales Order items…</p>}
        {detail && <div className="rounded-md bg-muted p-3 text-sm"><strong>{detail.order.customerNameSnapshot}</strong><p>PO: {detail.order.customerPONo || "—"} · Order total: ₱ {money(detail.order.grandTotal)} · Available: ₱ {money(detail.availableAmount)}</p></div>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="min-w-56">Product Name</th><th className="min-w-20">Unit</th><th className="min-w-24">Quantity</th><th className="min-w-28">Unit Price</th><th className="min-w-28 text-right">Amount</th><th /></tr></thead><tbody>{form.items.map((item, index) => <tr key={index}><td className="p-1"><Textarea aria-label={`Product name ${index + 1}`} value={item.productName} onChange={event => setForm({ ...form, items: form.items.map((line, i) => i === index ? { ...line, productName: event.target.value } : line) })} /></td><td className="p-1"><Input aria-label={`Unit ${index + 1}`} value={item.unit} onChange={event => setForm({ ...form, items: form.items.map((line, i) => i === index ? { ...line, unit: event.target.value } : line) })} /></td><td className="p-1"><Input aria-label={`Quantity ${index + 1}`} type="number" min="0.000001" step="any" value={item.quantity} onChange={event => setForm({ ...form, items: form.items.map((line, i) => i === index ? { ...line, quantity: Number(event.target.value) } : line) })} /></td><td className="p-1"><Input aria-label={`Unit price ${index + 1}`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={event => setForm({ ...form, items: form.items.map((line, i) => i === index ? { ...line, unitPrice: Number(event.target.value) } : line) })} /></td><td className="text-right p-1">{money(priced[index]?.amount ?? 0)}{(priced[index]?.discountAmount ?? 0) > 0 && <div className="text-xs text-muted-foreground">Discount: {money(priced[index].discountAmount)}</div>}</td><td><Button variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>Remove</Button></td></tr>)}</tbody></table></div>
        <Button variant="outline" disabled={!detail || busy} onClick={() => setForm({ ...form, items: [...form.items, { salesOrderItemId: "", productName: "", unit: "", quantity: 1, unitPrice: 0 }] })}><Plus className="size-4" />Add manual item</Button>
        <p className="text-right font-semibold">Total Amount Due: ₱ {money(total)}</p>
        {pricing.error && <p role="alert" className="text-destructive">{pricing.error}</p>}
        {detail && total > detail.availableAmount + 0.005 && <p role="alert" className="text-destructive">This amount exceeds the remaining Sales Order total. Reduce it before issuing.</p>}
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="proforma-remarks">Remarks (printed)</Label><Textarea id="proforma-remarks" value={form.remarks} onChange={event => setForm({ ...form, remarks: event.target.value })} /></div><div><Label htmlFor="proforma-notes">Notes (internal only)</Label><Textarea id="proforma-notes" placeholder="e.g. 50% DP" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></div></div>
        <div className="flex justify-end gap-2">{editingInvoice?.status !== "ISSUED" && <Button variant="outline" disabled={busy || orderLoading || !detail || !!pricing.error} onClick={() => void save(false)}>Save Draft</Button>}<Button disabled={busy || orderLoading || !detail || !!pricing.error || !priced.length || total <= 0 || total > (detail?.availableAmount ?? 0) + 0.005} onClick={() => void save(true)}>{busy ? "Saving…" : "Issue Proforma"}</Button></div>
      </div>}
    </DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(null); }}><DialogContent className="sm:max-w-none w-[96vw] h-[94dvh] flex flex-col"><DialogHeader><DialogTitle>{preview?.invoiceNo || "Draft Proforma Invoice"}</DialogTitle><DialogDescription>{preview?.companyName}</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void printFrame.current?.print().catch(error => toast.error(errorText(error)))}><Printer className="size-4" />Print</Button><Button variant="outline" disabled={busy} onClick={() => void pdf(false)}><Download className="size-4" />Download PDF</Button>{preview?.status === "ISSUED" && <><Button variant="outline" disabled={busy} onClick={() => void pdf(true)}><Save className="size-4" />Save PDF to Drive</Button><Button variant="outline" disabled={busy} onClick={() => scanInput.current?.click()}><Upload className="size-4" />Upload Scan</Button></>}{preview?.pdfLink && <a className="text-primary underline self-center" href={preview.pdfLink} target="_blank" rel="noreferrer">Saved PDF</a>}{preview?.scanLink && <a className="text-primary underline self-center" href={preview.scanLink} target="_blank" rel="noreferrer">Scanned Copy</a>}</div>
      {preview?.importIssue.includes("REVIEW") && <p className="text-sm text-amber-700">Legacy record needs review: {preview.importIssue}</p>}
      {preview && <ProformaNotesEditor key={`${preview.id}-${preview.version}`} invoice={preview} onSaved={value => { setPreview(value); void load(); }} />}
      <input ref={scanInput} type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setBusy(true); try { await upload(file, "scan"); } catch (error) { toast.error(errorText(error)); } finally { setBusy(false); } }} />
      <div className="min-h-0 flex-1 border rounded-md overflow-hidden">{preview && <BusinessDocumentPrintFrame ref={printFrame} title={preview.invoiceNo || "Draft Proforma"}><ProformaInvoicePrintDocument invoice={preview} signatureUrls={signatureUrls} /></BusinessDocumentPrintFrame>}</div>
    </DialogContent></Dialog>
    <Dialog open={!!cancelTarget} onOpenChange={open => { if (!open && !busy) setCancelTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Cancel {cancelTarget?.invoiceNo}?</DialogTitle><DialogDescription>The proforma will stop counting toward the Sales Order total. Its number and history will be retained.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setCancelTarget(null)}>Keep Proforma</Button><Button variant="destructive" disabled={busy} onClick={() => cancelTarget && void action(cancelTarget, "cancel")}>Cancel Proforma</Button></div></DialogContent></Dialog>
  </div>;
}

function ProformaNotesEditor({ invoice, onSaved }: { invoice: ProformaInvoice; onSaved: (invoice: ProformaInvoice) => void }) {
  const [notes, setNotes] = useState(invoice.notes);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      onSaved(await request<ProformaInvoice>(`/${invoice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notes", expectedVersion: invoice.version, notes }) }));
      toast.success("Internal notes saved.");
    } catch (error) { toast.error(errorText(error)); } finally { setSaving(false); }
  }
  return <div className="flex items-end gap-2"><div className="flex-1"><Label htmlFor="preview-proforma-notes">Notes (internal only)</Label><Input id="preview-proforma-notes" value={notes} maxLength={5000} onChange={event => setNotes(event.target.value)} /></div><Button variant="outline" disabled={saving || notes === invoice.notes} onClick={() => void save()}>Save Notes</Button></div>;
}

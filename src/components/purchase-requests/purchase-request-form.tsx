"use client";

import { useEffect, useMemo, useState } from "react";
import { ListPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prApi, type EligibleSalesOrder, type PrView } from "./api";

interface ProductOption { productId: string; productCode: string; productName: string; status?: string }
interface Line { productId: string; quantity: number; salesOrderItemId: string; remarks: string }

const blankLine = (): Line => ({ productId: "", quantity: 1, salesOrderItemId: "", remarks: "" });

export function PurchaseRequestForm({ open, onOpenChange, editing, requesterName, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PR being edited (Draft, or submitted but not yet handled); null to create. */
  editing: PrView | null;
  requesterName: string;
  onSaved: (pr: PrView) => void;
}) {
  // Mounted fresh (keyed) each time it opens, so initial state comes straight from `editing`.
  const [orders, setOrders] = useState<EligibleSalesOrder[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [salesOrderId, setSalesOrderId] = useState(editing?.salesOrderId ?? "");
  const [neededByDate, setNeededByDate] = useState(editing?.neededByDate ?? "");
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  const [lines, setLines] = useState<Line[]>(() => (editing?.lines.length
    ? editing.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, salesOrderItemId: l.salesOrderItemId, remarks: l.remarks }))
    : [blankLine()]));
  const [saving, setSaving] = useState(false);
  const [pickSoLines, setPickSoLines] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([prApi<EligibleSalesOrder[]>("/api/purchase-requests/sales-orders"), prApi<ProductOption[]>("/api/products")])
      .then(([so, p]) => {
        setOrders(so);
        setProducts(p.filter((x) => (x.status ?? "active") === "active").sort((a, b) => a.productName.localeCompare(b.productName)));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load sales orders."));
  }, []);

  const order = orders.find((o) => o.salesOrderId === salesOrderId);
  const orderOptions = useMemo(() => orders.map((o) => ({ value: o.salesOrderId, label: `${o.salesOrderNo} — ${o.customerName}` })), [orders]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.productId, label: `${p.productCode} — ${p.productName}` })), [products]);
  const soLineOptions = useMemo(() => [{ value: "__none", label: "—" }, ...(order?.lines ?? []).map((l) => ({ value: l.salesOrderItemId, label: `Line ${l.lineNo}: ${l.productName}` }))], [order]);
  const unitOf = (productId: string) => order?.lines.find((l) => l.productId === productId)?.unit ?? "";

  const setLine = (idx: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addPickedSoLines = () => {
    const added = (order?.lines ?? []).filter((l) => picked.has(l.salesOrderItemId))
      .map((l) => ({ productId: l.productId, quantity: Math.max(1, l.quantity ?? 1), salesOrderItemId: l.salesOrderItemId, remarks: "" }));
    setLines((prev) => [...prev.filter((l) => l.productId), ...added]);
    setPicked(new Set());
    setPickSoLines(false);
  };

  const save = async (submit: boolean) => {
    const items = lines.filter((l) => l.productId).map((l) => ({ ...l, salesOrderItemId: l.salesOrderItemId === "__none" ? "" : l.salesOrderItemId }));
    if (!salesOrderId) { toast.error("Choose the sales order this request is for."); return; }
    if (!items.length) { toast.error("Add at least one item."); return; }
    if (items.some((l) => !(l.quantity > 0))) { toast.error("Every quantity must be more than zero."); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ salesOrderId, neededByDate, purpose, items, version: editing?.version });
      let pr = editing
        ? await prApi<PrView>(`/api/purchase-requests/${encodeURIComponent(editing.prId)}`, { method: "PUT", body })
        : await prApi<PrView>("/api/purchase-requests", { method: "POST", body });
      if (submit && pr.status === "DRAFT") pr = await prApi<PrView>(`/api/purchase-requests/${encodeURIComponent(pr.prId)}/submit`, { method: "POST" });
      toast.success(pr.prNo ? `${pr.prNo} ${submit ? "submitted" : "saved"}.` : "Draft saved.");
      onSaved(pr);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save purchase request.");
    } finally {
      setSaving(false);
    }
  };

  const isSubmitted = editing && editing.status !== "DRAFT";

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.prNo || "draft purchase request"}` : "New purchase request"}</DialogTitle>
          <DialogDescription>List the items you need for this job. Purchasing sees it as soon as you submit.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Sales order</Label>
            <SearchableSelect value={salesOrderId} onValueChange={(v) => { setSalesOrderId(v); setLines((prev) => prev.map((l) => ({ ...l, salesOrderItemId: "" }))); }} options={orderOptions} placeholder="Select a confirmed sales order" emptyText="No confirmed sales orders." />
          </div>
          {order && (
            <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/50 p-3 text-sm md:grid-cols-3">
              <div><span className="block text-xs text-muted-foreground">Customer</span>{order.customerName || "—"}</div>
              <div><span className="block text-xs text-muted-foreground">Quotation no.</span>{order.quotationNo || "—"}</div>
              <div><span className="block text-xs text-muted-foreground">Delivery address</span><span className="whitespace-pre-line">{order.deliveryAddress || "—"}</span></div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Requested by</Label><Input value={editing?.requestedByName || requesterName} readOnly /></div>
            <div className="space-y-2"><Label>Needed by</Label><DatePickerInput value={neededByDate} onChange={setNeededByDate} /></div>
            <div className="space-y-2"><Label>Purpose / job notes</Label><Textarea rows={1} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
          </div>

          <div className="space-y-3">
            <Label>Items</Label>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 rounded-md border p-2 md:grid-cols-12 md:items-center md:border-0 md:p-0">
                <div className="col-span-2 min-w-0 md:col-span-5">
                  <SearchableSelect value={line.productId} onValueChange={(v) => setLine(idx, { productId: v })} options={productOptions} placeholder="Select product" />
                </div>
                <div className="flex items-center gap-1 md:col-span-2">
                  <Input aria-label={`Quantity for item ${idx + 1}`} type="number" min={1} step="any" value={line.quantity} onChange={(e) => setLine(idx, { quantity: Number(e.target.value) || 0 })} />
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">{unitOf(line.productId)}</span>
                </div>
                <div className="min-w-0 md:col-span-2">
                  <SearchableSelect value={line.salesOrderItemId || "__none"} onValueChange={(v) => setLine(idx, { salesOrderItemId: v })} options={soLineOptions} placeholder="For SO line" disabled={!order} />
                </div>
                <Input className="md:col-span-2" placeholder="Remarks" value={line.remarks} onChange={(e) => setLine(idx, { remarks: e.target.value })} />
                <Button variant="ghost" size="icon" className="justify-self-end text-destructive md:col-span-1" aria-label={`Remove item ${idx + 1}`} disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!order?.lines.length} onClick={() => setPickSoLines((v) => !v)}><ListPlus className="mr-2 h-4 w-4" />Add from sales order</Button>
              <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, blankLine()])}><Plus className="mr-2 h-4 w-4" />Add product</Button>
            </div>
            {pickSoLines && order && (
              <div className="space-y-2 rounded-md border p-3">
                {order.lines.map((l) => (
                  <label key={l.salesOrderItemId} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={picked.has(l.salesOrderItemId)} onCheckedChange={(c) => setPicked((prev) => { const next = new Set(prev); if (c) next.add(l.salesOrderItemId); else next.delete(l.salesOrderItemId); return next; })} />
                    <span>Line {l.lineNo}: {l.productCode} — {l.productName} × {l.quantity ?? "?"} {l.unit}</span>
                  </label>
                ))}
                <Button size="sm" disabled={!picked.size} onClick={addPickedSoLines}>Add selected</Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {!isSubmitted && <Button variant="secondary" onClick={() => void save(false)} disabled={saving}>Save draft</Button>}
          <Button onClick={() => void save(true)} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isSubmitted ? "Save changes" : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

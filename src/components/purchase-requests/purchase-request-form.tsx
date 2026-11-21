"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSignature, ListPlus, Loader2, PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { productPickerLabels } from "@/lib/purchaseRequests/domain";
import type { PrRequestType } from "@/types/purchaseRequest";
import { prApi, type ContractDueView, type EligibleContract, type EligibleSalesOrder, type PrView } from "./api";
import { ContractItemsPicker, type PickedContractLine } from "./contract-items-picker";

interface ProductOption { productId: string; productCode: string; productName: string; status?: string }
interface Line { kind: "product" | "typed"; productId: string; description: string; unit: string; quantity: number; salesOrderItemId: string; contractItemId: string; remarks: string }

const blankLine = (kind: Line["kind"] = "product"): Line => ({ kind, productId: "", description: "", unit: "", quantity: 1, salesOrderItemId: "", contractItemId: "", remarks: "" });
const isEmpty = (l: Line) => (l.kind === "product" ? !l.productId : !l.description.trim());

const REQUEST_TYPES: { value: PrRequestType; label: string }[] = [
  { value: "SALES_ORDER", label: "Sales order" },
  { value: "CONTRACT", label: "Customer contract" },
  { value: "NONE", label: "None" },
];

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
  const [contracts, setContracts] = useState<EligibleContract[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [requestType, setRequestType] = useState<PrRequestType>(editing?.requestType ?? "SALES_ORDER");
  const [salesOrderId, setSalesOrderId] = useState(editing?.salesOrderId ?? "");
  const [contractId, setContractId] = useState(editing?.contractId ?? "");
  const [neededByDate, setNeededByDate] = useState(editing?.neededByDate ?? "");
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  const [lines, setLines] = useState<Line[]>(() => (editing?.lines.length
    ? editing.lines.map((l) => ({
      kind: l.productId ? "product" as const : "typed" as const, productId: l.productId, description: l.productId ? "" : l.productNameSnapshot,
      unit: l.productId ? "" : l.unitSnapshot, quantity: l.quantity, salesOrderItemId: l.salesOrderItemId, contractItemId: l.contractItemId, remarks: l.remarks,
    }))
    : [blankLine()]));
  const [saving, setSaving] = useState(false);
  /** Latest saved copy; a failed submit is retried against it (no duplicate draft, current version). */
  const [current, setCurrent] = useState<PrView | null>(editing);
  const [pickSoLines, setPickSoLines] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [contractDue, setContractDue] = useState<ContractDueView[] | null>(null);
  const [dueLoading, setDueLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      prApi<EligibleSalesOrder[]>("/api/purchase-requests/sales-orders"),
      prApi<EligibleContract[]>("/api/purchase-requests/contracts"),
      prApi<ProductOption[]>("/api/products"),
    ])
      .then(([so, c, p]) => {
        setOrders(so);
        setContracts(c);
        setProducts(p.filter((x) => (x.status ?? "active") === "active").sort((a, b) => a.productName.localeCompare(b.productName)));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load the form."));
  }, []);

  const order = requestType === "SALES_ORDER" ? orders.find((o) => o.salesOrderId === salesOrderId) : undefined;
  const contract = requestType === "CONTRACT" ? contracts.find((c) => c.contractId === contractId) : undefined;
  const orderOptions = useMemo(() => orders.map((o) => ({ value: o.salesOrderId, label: `${o.salesOrderNo} — ${o.customerName}` })), [orders]);
  const contractOptions = useMemo(() => contracts.map((c) => ({ value: c.contractId, label: `${c.contractNo} — ${c.customerName}${c.description ? ` · ${c.description}` : ""}` })), [contracts]);
  const productOptions = useMemo(() => {
    const labels = productPickerLabels(products);
    return products.map((p) => ({ value: p.productId, label: labels.get(p.productId) ?? p.productName }));
  }, [products]);
  const soLineOptions = useMemo(() => [{ value: "__none", label: "—" }, ...(order?.lines ?? []).map((l) => ({ value: l.salesOrderItemId, label: `Line ${l.lineNo}: ${l.productName}` }))], [order]);
  const unitOf = (line: Line) => order?.lines.find((l) => l.productId === line.productId)?.unit
    ?? contractDue?.find((d) => d.contractItemId === line.contractItemId)?.unit ?? "";

  const setLine = (idx: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const appendLines = (added: Line[]) => setLines((prev) => { const kept = prev.filter((l) => !isEmpty(l)); return [...kept, ...added].length ? [...kept, ...added] : [blankLine()]; });

  /** Switching what the request is for drops the other reference and any line links to it. */
  const changeType = (value: string) => {
    const next = value as PrRequestType;
    setRequestType(next);
    if (next !== "SALES_ORDER") setSalesOrderId("");
    if (next !== "CONTRACT") setContractId("");
    setLines((prev) => prev.map((l) => ({ ...l, salesOrderItemId: "", contractItemId: "" })));
    setPickSoLines(false);
    setContractDue(null);
  };

  const addPickedSoLines = () => {
    appendLines((order?.lines ?? []).filter((l) => picked.has(l.salesOrderItemId))
      .map((l) => ({ ...blankLine(), productId: l.productId, quantity: Math.max(1, l.quantity ?? 1), salesOrderItemId: l.salesOrderItemId })));
    setPicked(new Set());
    setPickSoLines(false);
  };

  const toggleContractPicker = () => {
    if (contractDue) { setContractDue(null); return; }
    setDueLoading(true);
    setContractDue([]);
    const exclude = current?.prId ? `?excludePr=${encodeURIComponent(current.prId)}` : "";
    prApi<ContractDueView[]>(`/api/purchase-requests/contracts/${encodeURIComponent(contractId)}/due${exclude}`)
      .then(setContractDue)
      .catch((error) => { toast.error(error instanceof Error ? error.message : "Failed to load contract items."); setContractDue(null); })
      .finally(() => setDueLoading(false));
  };

  const addContractLines = (added: PickedContractLine[]) => {
    appendLines(added.map((l) => ({ ...blankLine(), productId: l.productId, quantity: l.quantity, contractItemId: l.contractItemId })));
    setContractDue(null);
  };

  const save = async (submit: boolean) => {
    const filled = lines.filter((l) => !isEmpty(l));
    if (requestType === "SALES_ORDER" && !salesOrderId) { toast.error("Choose the sales order this request is for."); return; }
    if (requestType === "CONTRACT" && !contractId) { toast.error("Choose the contract this request is for."); return; }
    if (!filled.length) { toast.error("Add at least one item."); return; }
    if (filled.some((l) => !(l.quantity > 0))) { toast.error("Every quantity must be more than zero."); return; }
    const items = filled.map((l) => (l.kind === "typed"
      ? { description: l.description.trim(), unit: l.unit.trim(), quantity: l.quantity, remarks: l.remarks }
      : { productId: l.productId, quantity: l.quantity, remarks: l.remarks, salesOrderItemId: l.salesOrderItemId === "__none" ? "" : l.salesOrderItemId, contractItemId: l.contractItemId }));
    setSaving(true);
    try {
      const body = JSON.stringify({ requestType, salesOrderId, contractId, neededByDate, purpose, items, version: current?.version });
      let pr = current
        ? await prApi<PrView>(`/api/purchase-requests/${encodeURIComponent(current.prId)}`, { method: "PUT", body })
        : await prApi<PrView>("/api/purchase-requests", { method: "POST", body });
      setCurrent(pr);
      onSaved(pr);
      if (submit && pr.status === "DRAFT") {
        pr = await prApi<PrView>(`/api/purchase-requests/${encodeURIComponent(pr.prId)}/submit`, { method: "POST" });
        setCurrent(pr);
      }
      toast.success(pr.prNo ? `${pr.prNo} ${submit ? "submitted" : "saved"}.` : "Draft saved.");
      onSaved(pr);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save purchase request.");
    } finally {
      setSaving(false);
    }
  };

  const isSubmitted = current && current.status !== "DRAFT";

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.prNo || "draft purchase request"}` : "New purchase request"}</DialogTitle>
          <DialogDescription>List the items you need for this job. Purchasing sees it as soon as you submit.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Request for</Label>
            <Tabs value={requestType} onValueChange={changeType}>
              <TabsList>
                {REQUEST_TYPES.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          {requestType === "SALES_ORDER" && (
            <div className="space-y-2">
              <Label>Sales order</Label>
              <SearchableSelect value={salesOrderId} onValueChange={(v) => { setSalesOrderId(v); setLines((prev) => prev.map((l) => ({ ...l, salesOrderItemId: "" }))); }} options={orderOptions} placeholder="Select a confirmed sales order" emptyText="No confirmed sales orders." />
            </div>
          )}
          {requestType === "CONTRACT" && (
            <div className="space-y-2">
              <Label>Customer contract</Label>
              <SearchableSelect value={contractId} onValueChange={(v) => { setContractId(v); setContractDue(null); setLines((prev) => prev.map((l) => ({ ...l, contractItemId: "" }))); }} options={contractOptions} placeholder="Select an active contract" emptyText="No active contracts." />
            </div>
          )}
          {order && (
            <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/50 p-3 text-sm md:grid-cols-3">
              <div><span className="block text-xs text-muted-foreground">Customer</span>{order.customerName || "—"}</div>
              <div><span className="block text-xs text-muted-foreground">Quotation no.</span>{order.quotationNo || "—"}</div>
              <div><span className="block text-xs text-muted-foreground">Delivery address</span><span className="whitespace-pre-line">{order.deliveryAddress || "—"}</span></div>
            </div>
          )}
          {contract && (
            <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/50 p-3 text-sm md:grid-cols-2">
              <div><span className="block text-xs text-muted-foreground">Customer</span>{contract.customerName || "—"}</div>
              <div><span className="block text-xs text-muted-foreground">Contract</span>{contract.contractNo}{contract.description ? ` · ${contract.description}` : ""}</div>
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
                {line.kind === "product" ? (
                  <div className="col-span-2 min-w-0 md:col-span-5">
                    <SearchableSelect value={line.productId} onValueChange={(v) => setLine(idx, { productId: v })} options={productOptions} placeholder="Select product" />
                  </div>
                ) : (
                  <div className="col-span-2 flex min-w-0 gap-1 md:col-span-5">
                    <Input aria-label={`Description for item ${idx + 1}`} placeholder="Type the item" value={line.description} onChange={(e) => setLine(idx, { description: e.target.value })} />
                  </div>
                )}
                <div className="flex items-center gap-1 md:col-span-2">
                  <Input aria-label={`Quantity for item ${idx + 1}`} type="number" min={1} step="any" value={line.quantity} onChange={(e) => setLine(idx, { quantity: Number(e.target.value) || 0 })} />
                  {line.kind === "typed"
                    ? <Input aria-label={`Unit for item ${idx + 1}`} className="w-16 shrink-0" placeholder="Unit" value={line.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} />
                    : <span className="w-10 shrink-0 text-xs text-muted-foreground">{unitOf(line)}</span>}
                </div>
                {requestType === "SALES_ORDER" ? (
                  <div className="min-w-0 md:col-span-2">
                    <SearchableSelect value={line.salesOrderItemId || "__none"} onValueChange={(v) => setLine(idx, { salesOrderItemId: v })} options={soLineOptions} placeholder="For SO line" disabled={!order || line.kind === "typed"} />
                  </div>
                ) : <div className="hidden md:col-span-2 md:block" />}
                <Input className="md:col-span-2" placeholder="Remarks" value={line.remarks} onChange={(e) => setLine(idx, { remarks: e.target.value })} />
                <Button variant="ghost" size="icon" className="justify-self-end text-destructive md:col-span-1" aria-label={`Remove item ${idx + 1}`} disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {requestType === "SALES_ORDER" && <Button variant="outline" size="sm" disabled={!order?.lines.length} onClick={() => setPickSoLines((v) => !v)}><ListPlus className="mr-2 h-4 w-4" />Add from sales order</Button>}
              {requestType === "CONTRACT" && <Button variant="outline" size="sm" disabled={!contractId} onClick={toggleContractPicker}><FileSignature className="mr-2 h-4 w-4" />Add from contract</Button>}
              <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, blankLine()])}><Plus className="mr-2 h-4 w-4" />Add product</Button>
              <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, blankLine("typed")])}><PenLine className="mr-2 h-4 w-4" />Add typed item</Button>
            </div>
            {pickSoLines && order && (
              <div className="space-y-2 rounded-md border p-3">
                {order.lines.map((l) => (
                  <label key={l.salesOrderItemId} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={picked.has(l.salesOrderItemId)} onCheckedChange={(c) => setPicked((prev) => { const next = new Set(prev); if (c) next.add(l.salesOrderItemId); else next.delete(l.salesOrderItemId); return next; })} />
                    <span>Line {l.lineNo}: {l.productName} × {l.quantity ?? "?"} {l.unit}</span>
                  </label>
                ))}
                <Button size="sm" disabled={!picked.size} onClick={addPickedSoLines}>Add selected</Button>
              </div>
            )}
            {contractDue && <ContractItemsPicker key={dueLoading ? "loading" : contractId} due={contractDue} loading={dueLoading} onAdd={addContractLines} />}
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

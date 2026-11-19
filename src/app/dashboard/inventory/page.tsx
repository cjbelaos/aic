"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityTable } from "@/components/ui/entity-table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { canPerform, type AccessLevel, type EntryType } from "@/lib/inventory/domain";

interface StockRow {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  openingDate: string | null;
  onHand: number;
  safetyStock: number;
  available: number;
}

interface HistoryRow {
  id: string;
  date: string;
  type: string;
  qty: number;
  status: string;
  referenceNo: string;
  note: string;
  by: string;
  source: { kind: string; id: string; label: string };
}

const ENTRY_TYPES: { value: EntryType; label: string; help: string }[] = [
  { value: "OPENING", label: "Opening count", help: "Starting stock from the physical count, as of launch day. Once per product per warehouse." },
  { value: "RECEIVED", label: "Received", help: "Goods that arrived from a supplier." },
  { value: "RETURN", label: "Customer return", help: "Goods that came back from a customer." },
  { value: "ADJUSTMENT", label: "Adjustment", help: "Correct a count, damage or loss. Use a minus sign to remove stock. A note is required." },
];

const TYPE_LABEL: Record<string, string> = {
  OPENING: "Opening count",
  RECEIVED: "Received",
  RETURN: "Customer return",
  ADJUSTMENT: "Adjustment",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  DR: "Delivery",
};

const today = () => new Date().toISOString().split("T")[0];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Request failed.");
  return body as T;
}

export default function InventoryPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [warehouses, setWarehouses] = useState<{ warehouseId: string; name: string }[]>([]);
  const [trackedProducts, setTrackedProducts] = useState<{ productId: string; productCode: string; productName: string }[]>([]);
  const [level, setLevel] = useState<AccessLevel>("view");
  const [loading, setLoading] = useState(true);
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  /* History drawer */
  const [historyTarget, setHistoryTarget] = useState<StockRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* Safety stock dialog */
  const [safetyTarget, setSafetyTarget] = useState<StockRow | null>(null);
  const [safetyValue, setSafetyValue] = useState("");

  /* Stock entry dialog */
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType>("OPENING");
  const [entryWarehouse, setEntryWarehouse] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [entryRef, setEntryRef] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryLines, setEntryLines] = useState<{ productId: string; qty: string }[]>([{ productId: "", qty: "" }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () => api<{ level: AccessLevel; warehouses: { warehouseId: string; name: string }[]; products: { productId: string; productCode: string; productName: string }[]; rows: StockRow[] }>("/api/inventory")
      .then((data) => {
        setTrackedProducts(data.products);
        setRows(data.rows);
        setWarehouses(data.warehouses);
        setLevel(data.level);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load inventory."))
      .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  const openHistory = async (row: StockRow) => {
    setHistoryTarget(row);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const data = await api<{ rows: HistoryRow[] }>(`/api/inventory/history?warehouseId=${encodeURIComponent(row.warehouseId)}&productId=${encodeURIComponent(row.productId)}`);
      setHistory(data.rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const voidEntry = async (id: string) => {
    if (!window.confirm("Void this stock entry? Stock will be recalculated without it.")) return;
    try {
      await api(`/api/inventory/entries/${encodeURIComponent(id)}/void`, { method: "POST" });
      toast.success("Entry voided.");
      await load();
      if (historyTarget) await openHistory(historyTarget);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void entry.");
    }
  };

  const saveSafety = async () => {
    if (!safetyTarget) return;
    setSaving(true);
    try {
      await api("/api/inventory/safety-stock", {
        method: "PUT",
        body: JSON.stringify({ warehouseId: safetyTarget.warehouseId, productId: safetyTarget.productId, qty: Number(safetyValue || 0) }),
      });
      toast.success("Safety stock saved.");
      setSafetyTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save safety stock.");
    } finally {
      setSaving(false);
    }
  };

  const allowedTypes = ENTRY_TYPES.filter((t) => canPerform(level, `entry:${t.value}`));
  const openEntry = () => {
    setEntryType(allowedTypes[0]?.value ?? "OPENING");
    setEntryWarehouse(warehouseFilter !== "all" ? warehouseFilter : "");
    setEntryDate(today());
    setEntryRef("");
    setEntryNote("");
    setEntryLines([{ productId: "", qty: "" }]);
    setEntryOpen(true);
  };

  const saveEntry = async () => {
    const lines = entryLines.filter((l) => l.productId);
    if (!entryWarehouse) { toast.error("Choose a warehouse."); return; }
    if (!lines.length) { toast.error("Add at least one product."); return; }
    setSaving(true);
    try {
      await api("/api/inventory/entries", {
        method: "POST",
        body: JSON.stringify({ type: entryType, warehouseId: entryWarehouse, date: entryDate, referenceNo: entryRef, note: entryNote, lines: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })) }),
      });
      toast.success(`${lines.length} ${lines.length === 1 ? "entry" : "entries"} saved.`);
      setEntryOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save stock entry.");
    } finally {
      setSaving(false);
    }
  };

  const categories = useMemo(() => [...new Set(rows.map((r) => r.categoryName).filter(Boolean))].sort(), [rows]);
  const productOptions = useMemo(
    () => trackedProducts
      .map((p) => ({ value: p.productId, label: `${p.productCode} — ${p.productName}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [trackedProducts],
  );
  const visible = rows.filter((r) =>
    (warehouseFilter === "all" || r.warehouseId === warehouseFilter) && (categoryFilter === "all" || r.categoryName === categoryFilter));

  const columns: ColumnDef<StockRow>[] = [
    {
      accessorKey: "productName",
      header: "Product",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium">{row.original.productName}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.productCode}</div>
        </div>
      ),
    },
    { accessorKey: "categoryName", header: "Category" },
    { accessorKey: "warehouseName", header: "Warehouse" },
    {
      accessorKey: "onHand",
      header: "On hand",
      cell: ({ row }) => row.original.openingDate
        ? <span className={`tabular-nums ${row.original.onHand < 0 ? "font-semibold text-destructive" : ""}`}>{row.original.onHand}</span>
        : <Badge variant="outline">Needs opening count</Badge>,
    },
    {
      accessorKey: "safetyStock",
      header: "Safety",
      cell: ({ row }) => canPerform(level, "safety:set")
        ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 tabular-nums"
            title="Set safety stock"
            onClick={(event) => { event.stopPropagation(); setSafetyTarget(row.original); setSafetyValue(String(row.original.safetyStock)); }}
          >
            {row.original.safetyStock}
          </Button>
        )
        : <span className="tabular-nums">{row.original.safetyStock}</span>,
    },
    {
      accessorKey: "available",
      header: "Available",
      cell: ({ row }) => (
        <span className={`tabular-nums ${row.original.available < 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>{row.original.available}</span>
      ),
    },
  ];

  const filters = (
    <div className="flex flex-wrap gap-2">
      <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
        <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All warehouses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All warehouses</SelectItem>
          {warehouses.map((w) => <SelectItem key={w.warehouseId} value={w.warehouseId}>{w.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const entryHelp = ENTRY_TYPES.find((t) => t.value === entryType)?.help;

  return (
    <>
      <div className="min-w-0 p-3 sm:p-6">
        <EntityTable
          title="Stock on Hand"
          columns={columns}
          data={visible}
          loading={loading}
          hideTransferButtons
          toolbarFilters={filters}
          headerActions={allowedTypes.length ? <Button onClick={openEntry}><Plus className="mr-2 h-4 w-4" />Add stock entry</Button> : undefined}
          onRowClick={(row) => void openHistory(row)}
          getRowId={(row) => `${row.warehouseId}|${row.productId}`}
          getRowClassName={(row) => (row.onHand < 0 ? "bg-destructive/10" : row.available < 0 ? "bg-amber-500/10" : "")}
          mobileLayout={{
            primary: ["productName", "warehouseName", "onHand", "available"],
            labels: { productName: "Product", categoryName: "Category", warehouseName: "Warehouse", onHand: "On hand", safetyStock: "Safety", available: "Available" },
          }}
        />
        {!loading && (trackedProducts.length === 0 || warehouses.length === 0) && (
          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
            {trackedProducts.length === 0 && (
              <p>No products are tracked yet. Turn on &quot;Track inventory&quot; for a product category to start.</p>
            )}
            {warehouses.length === 0 && (
              <p>There are no active warehouses. Add one on the Warehouses page, then it appears here.</p>
            )}
          </div>
        )}
      </div>

      {/* Movement history */}
      <Sheet open={!!historyTarget} onOpenChange={(open) => { if (!open) setHistoryTarget(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{historyTarget?.productName}</SheetTitle>
            <SheetDescription>
              {historyTarget?.warehouseName} · {historyTarget?.onHand ?? 0} on hand
              {historyTarget?.openingDate ? ` · counted from ${historyTarget.openingDate}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-6">
            {historyLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            {!historyLoading && history.length === 0 && <p className="text-sm text-muted-foreground">No movements yet.</p>}
            {history.map((h) => (
              <div key={h.id} className={`flex items-start justify-between gap-3 rounded-md border p-3 ${h.status !== "active" ? "opacity-60" : ""}`}>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium">
                    {TYPE_LABEL[h.type] ?? h.type}
                    {h.status === "void" && <Badge variant="outline" className="ml-2">Void</Badge>}
                    {h.status === "pending_approval" && <Badge variant="outline" className="ml-2">Pending approval</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.date}{h.source.label ? ` · ${h.source.label}` : ""}{h.by ? ` · ${h.by}` : ""}
                  </div>
                  {h.note && <div className="text-xs">{h.note}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`tabular-nums text-sm font-semibold ${h.qty < 0 ? "text-destructive" : ""}`}>{h.qty > 0 ? `+${h.qty}` : h.qty}</span>
                  {h.source.kind === "ENTRY" && h.status === "active" && canPerform(level, "entry:void") && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Void entry" onClick={() => void voidEntry(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Safety stock */}
      <Dialog open={!!safetyTarget} onOpenChange={(open) => { if (!open && !saving) setSafetyTarget(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Safety stock</DialogTitle>
            <DialogDescription>
              {safetyTarget?.productName} at {safetyTarget?.warehouseName}. Deliveries that dip into this quantity need a manager&apos;s approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="safety-qty">Reserved quantity</Label>
            <Input id="safety-qty" type="number" min={0} value={safetyValue} onChange={(e) => setSafetyValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSafetyTarget(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveSafety()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock entry */}
      <Dialog open={entryOpen} onOpenChange={(open) => { if (!saving) setEntryOpen(open); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Add stock entry</DialogTitle>
            <DialogDescription>{entryHelp}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={entryType} onValueChange={(v) => setEntryType(v as EntryType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Warehouse <span className="text-destructive">*</span></Label>
                <Select value={entryWarehouse} onValueChange={setEntryWarehouse}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.warehouseId} value={w.warehouseId}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePickerInput value={entryDate} onChange={setEntryDate} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Reference no.</Label>
                <Input value={entryRef} onChange={(e) => setEntryRef(e.target.value)} placeholder="e.g. supplier DR or invoice no." />
              </div>
              <div className="space-y-2">
                <Label>Note {entryType === "ADJUSTMENT" && <span className="text-destructive">*</span>}</Label>
                <Textarea rows={1} value={entryNote} onChange={(e) => setEntryNote(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Products</Label>
              {entryLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      value={line.productId}
                      onValueChange={(v) => setEntryLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: v } : l)))}
                      options={productOptions}
                      placeholder="Select product"
                      emptyText="No tracked products. Turn on “Track inventory” for a product category first."
                    />
                  </div>
                  <Input
                    aria-label={`Quantity for line ${idx + 1}`}
                    className="w-28 shrink-0"
                    type="number"
                    value={line.qty}
                    placeholder={entryType === "ADJUSTMENT" ? "+/- qty" : "Qty"}
                    onChange={(e) => setEntryLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive"
                    aria-label={`Remove line ${idx + 1}`}
                    disabled={entryLines.length === 1}
                    onClick={() => setEntryLines((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setEntryLines((prev) => [...prev, { productId: "", qty: "" }])}>
                <Plus className="mr-2 h-4 w-4" />Add product
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveEntry()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

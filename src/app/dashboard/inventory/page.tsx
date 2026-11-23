"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
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
import { canPerform, type AccessLevel, type EntryType, type HistoryRow } from "@/lib/inventory/domain";
import { exportStockMovements } from "@/lib/inventory/export";
import { pivotStock, type ProductRow, type StockRow } from "@/lib/inventory/pivot";

const NEG_ON_HAND = "font-semibold text-destructive";
const NEG_AVAILABLE = "text-amber-600 dark:text-amber-400";

/** One warehouse cell: on hand over available, or a prompt to count. */
function WarehouseCell({ cell, onOpen }: { cell: StockRow | undefined; onOpen: (row: StockRow) => void }) {
  if (!cell) return <span className="text-muted-foreground">—</span>;
  const counted = Boolean(cell.openingDate);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto flex-col items-start gap-0 px-2 py-1"
      title={`Open ${cell.warehouseName}`}
      onClick={(event) => { event.stopPropagation(); onOpen(cell); }}
    >
      {counted ? (
        <>
          <span className={`tabular-nums ${cell.onHand < 0 ? NEG_ON_HAND : ""}`}>{cell.onHand}</span>
          <span className={`text-xs font-normal tabular-nums ${cell.available < 0 ? NEG_AVAILABLE : "text-muted-foreground"}`}>avl {cell.available}</span>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">—</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">count</Badge>
        </>
      )}
    </Button>
  );
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

  /* Side panel for one product at one warehouse; the row is derived so it tracks reloads. */
  const [panelKey, setPanelKey] = useState<{ warehouseId: string; productId: string } | null>(null);
  const panelRow = useMemo(
    () => (panelKey ? rows.find((r) => r.warehouseId === panelKey.warehouseId && r.productId === panelKey.productId) ?? null : null),
    [rows, panelKey],
  );
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* Safety stock dialog */
  const [safetyTarget, setSafetyTarget] = useState<StockRow | null>(null);

  /* On hand dialog: first count (opening) or recount (adjustment) */
  const [countTarget, setCountTarget] = useState<StockRow | null>(null);
  const [countValue, setCountValue] = useState("");
  const [countReason, setCountReason] = useState("");
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
  const [exporting, setExporting] = useState(false);

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

  /** Every movement (entries, transfers, deliveries) for the selected warehouse, or all warehouses. */
  const exportMovements = async () => {
    setExporting(true);
    try {
      const query = warehouseFilter === "all" ? "" : `?warehouseId=${encodeURIComponent(warehouseFilter)}`;
      const data = await api<{ rows: HistoryRow[] }>(`/api/inventory/history${query}`);
      if (data.rows.length === 0) { toast.message("No stock movements to export yet."); return; }
      const warehouseNames = new Map<string, string>(rows.map((r) => [r.warehouseId, r.warehouseName]));
      for (const w of warehouses) warehouseNames.set(w.warehouseId, w.name);
      const productNames = new Map<string, { code: string; name: string }>(rows.map((r) => [r.productId, { code: r.productCode, name: r.productName }]));
      for (const p of trackedProducts) productNames.set(p.productId, { code: p.productCode, name: p.productName });
      await exportStockMovements(
        data.rows,
        {
          warehouse: (id) => warehouseNames.get(id) ?? id,
          product: (id) => productNames.get(id) ?? { code: "", name: id },
        },
        { warehouse: warehouseFilter === "all" ? "All warehouses" : warehouseNames.get(warehouseFilter) ?? warehouseFilter },
      );
      toast.success(`Exported ${data.rows.length} movement${data.rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export movements.");
    } finally {
      setExporting(false);
    }
  };

  const loadHistory = async (key: { warehouseId: string; productId: string }) => {
    setHistoryLoading(true);
    try {
      const data = await api<{ rows: HistoryRow[] }>(`/api/inventory/history?warehouseId=${encodeURIComponent(key.warehouseId)}&productId=${encodeURIComponent(key.productId)}`);
      setHistory(data.rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openPanel = (row: StockRow) => {
    const key = { warehouseId: row.warehouseId, productId: row.productId };
    setPanelKey(key);
    setHistory([]);
    void loadHistory(key);
  };

  const voidEntry = async (id: string) => {
    if (!window.confirm("Void this stock entry? Stock will be recalculated without it.")) return;
    try {
      await api(`/api/inventory/entries/${encodeURIComponent(id)}/void`, { method: "POST" });
      toast.success("Entry voided.");
      await load();
      if (panelKey) await loadHistory(panelKey);
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

  const openCount = (row: StockRow) => {
    setCountTarget(row);
    setCountValue(row.openingDate ? String(row.onHand) : "");
    setCountReason("");
  };

  const saveCount = async () => {
    if (!countTarget) return;
    const counted = Number(countValue);
    if (countValue.trim() === "" || !Number.isFinite(counted) || counted < 0) { toast.error("Enter the counted quantity (0 or more)."); return; }
    const isRecount = Boolean(countTarget.openingDate);
    const delta = counted - countTarget.onHand;
    if (isRecount && delta === 0) { toast.message("No change: the count matches what is on hand."); setCountTarget(null); return; }
    if (isRecount && !countReason.trim()) { toast.error("Enter a reason for the recount."); return; }
    setSaving(true);
    try {
      await api("/api/inventory/entries", {
        method: "POST",
        body: JSON.stringify(isRecount
          ? {
              type: "ADJUSTMENT",
              warehouseId: countTarget.warehouseId,
              date: today(),
              referenceNo: "RECOUNT",
              note: `Recount: system ${countTarget.onHand}, counted ${counted}. ${countReason.trim()}`,
              lines: [{ productId: countTarget.productId, qty: delta }],
            }
          : {
              type: "OPENING",
              warehouseId: countTarget.warehouseId,
              date: today(),
              referenceNo: "",
              note: "",
              lines: [{ productId: countTarget.productId, qty: counted }],
            }),
      });
      toast.success(isRecount ? `Recount saved (${delta > 0 ? "+" : ""}${delta}).` : "Opening count saved.");
      setCountTarget(null);
      await load();
      if (panelKey) await loadHistory(panelKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the count.");
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
  const products = useMemo(() => pivotStock(rows, warehouses.map((w) => w.warehouseId)), [rows, warehouses]);
  // The warehouse filter now narrows columns, not rows.
  const shownWarehouses = warehouseFilter === "all" ? warehouses : warehouses.filter((w) => w.warehouseId === warehouseFilter);
  const visible = products.filter((p) => categoryFilter === "all" || p.categoryName === categoryFilter);

  const columns: ColumnDef<ProductRow>[] = [
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
    ...shownWarehouses.map((w): ColumnDef<ProductRow> => ({
      id: `wh:${w.warehouseId}`,
      header: w.name,
      accessorFn: (p) => {
        const cell = p.cells[w.warehouseId];
        return cell?.openingDate ? cell.onHand : null;
      },
      sortUndefined: "last",
      cell: ({ row }) => <WarehouseCell cell={row.original.cells[w.warehouseId]} onOpen={openPanel} />,
    })),
    {
      id: "total",
      header: "Total",
      accessorFn: (p) => p.totalOnHand,
      cell: ({ row }) => (
        <div className="flex flex-col px-2">
          <span className={`font-medium tabular-nums ${row.original.totalOnHand < 0 ? NEG_ON_HAND : ""}`}>{row.original.totalOnHand}</span>
          <span className={`text-xs tabular-nums ${row.original.totalAvailable < 0 ? NEG_AVAILABLE : "text-muted-foreground"}`}>avl {row.original.totalAvailable}</span>
        </div>
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
          headerActions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void exportMovements()} disabled={exporting} title="Download every stock movement for the selected warehouse">
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export movements
              </Button>
              {allowedTypes.length > 0 && <Button onClick={openEntry}><Plus className="mr-2 h-4 w-4" />Add stock entry</Button>}
            </div>
          )}
          getRowId={(row) => row.productId}
          mobileLayout={{
            primary: ["productName", "total", ...shownWarehouses.map((w) => `wh:${w.warehouseId}`)],
            labels: {
              productName: "Product",
              categoryName: "Category",
              total: "Total",
              ...Object.fromEntries(shownWarehouses.map((w) => [`wh:${w.warehouseId}`, w.name])),
            },
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
      <Sheet open={!!panelKey} onOpenChange={(open) => { if (!open) setPanelKey(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{panelRow?.productName}</SheetTitle>
            <SheetDescription>
              {panelRow?.warehouseName}
              {panelRow?.openingDate ? ` · counted from ${panelRow.openingDate}` : " · not counted yet"}
            </SheetDescription>
          </SheetHeader>
          {panelRow && (
            <div className="space-y-3 px-4">
              <dl className="grid grid-cols-3 gap-2 rounded-md border p-3 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">On hand</dt>
                  <dd className={`text-lg tabular-nums ${panelRow.onHand < 0 ? NEG_ON_HAND : ""}`}>{panelRow.openingDate ? panelRow.onHand : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Safety</dt>
                  <dd className="text-lg tabular-nums">{panelRow.safetyStock}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Available</dt>
                  <dd className={`text-lg tabular-nums ${panelRow.openingDate && panelRow.available < 0 ? NEG_AVAILABLE : ""}`}>{panelRow.openingDate ? panelRow.available : "—"}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {/* First count needs the opening-count right; a recount is an adjustment. */}
                {canPerform(level, panelRow.openingDate ? "entry:ADJUSTMENT" : "entry:OPENING") && (
                  <Button size="sm" onClick={() => openCount(panelRow)}>{panelRow.openingDate ? "Recount" : "Opening count"}</Button>
                )}
                {canPerform(level, "safety:set") && (
                  <Button size="sm" variant="outline" onClick={() => { setSafetyTarget(panelRow); setSafetyValue(String(panelRow.safetyStock)); }}>Set safety</Button>
                )}
              </div>
              <h3 className="pt-2 text-sm font-medium">Movements</h3>
            </div>
          )}
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

      {/* On hand: opening count or recount */}
      <Dialog open={!!countTarget} onOpenChange={(open) => { if (!open && !saving) setCountTarget(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{countTarget?.openingDate ? "Recount" : "Opening count"}</DialogTitle>
            <DialogDescription>
              {countTarget?.productName} at {countTarget?.warehouseName}.{" "}
              {countTarget?.openingDate
                ? `The system shows ${countTarget.onHand} on hand. Enter what is actually on the shelf; the difference is recorded as an adjustment.`
                : "Enter what is on the shelf today. Stock is counted from today."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="count-qty">{countTarget?.openingDate ? "Actual quantity on the shelf" : "Counted quantity"}</Label>
              <Input id="count-qty" type="number" min={0} value={countValue} onChange={(e) => setCountValue(e.target.value)} />
              {countTarget?.openingDate && countValue.trim() !== "" && Number(countValue) !== countTarget.onHand && (
                <p className="text-xs text-muted-foreground">
                  Adjustment of {Number(countValue) - countTarget.onHand > 0 ? "+" : ""}{Number(countValue) - countTarget.onHand}
                </p>
              )}
            </div>
            {countTarget?.openingDate && (
              <div className="space-y-2">
                <Label htmlFor="count-reason">Reason <span className="text-destructive">*</span></Label>
                <Textarea id="count-reason" rows={2} value={countReason} onChange={(e) => setCountReason(e.target.value)} placeholder="e.g. physical recount, damaged units" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountTarget(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveCount()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

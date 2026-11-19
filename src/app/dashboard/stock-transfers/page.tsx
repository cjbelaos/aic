"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityTable } from "@/components/ui/entity-table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeliverySerialInput } from "@/components/delivery-serial-input";
import { StockLineHint, WarehouseSelect, approvalPrompt, useActiveWarehouses, useStockCheck } from "@/components/inventory/dr-stock";
import { canPerform, type AccessLevel } from "@/lib/inventory/domain";
import { parseSerialInput } from "@/lib/deliverySerials";
import type { Warehouse } from "@/types/warehouse";

interface TransferItem { productId: string; qty: number; serialNumbers: string[] }
interface Transfer {
  transferId: string;
  transferNo: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: "pending_approval" | "created" | "rejected" | "cancelled";
  preparedBy: string;
  note: string;
  approvalNote: string;
  createdAt: string;
  items: TransferItem[];
}
interface ProductOption { productId: string; productCode: string; productName: string }

const STATUS: Record<Transfer["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  created: { label: "Moved", variant: "secondary" },
  pending_approval: { label: "Pending approval", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const today = () => new Date().toISOString().split("T")[0];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Request failed.");
  return body as T;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Opens a printable A4 transfer slip in a new window. */
function printSlip(t: Transfer, warehouses: Warehouse[], productName: (id: string) => string) {
  const wh = (id: string) => warehouses.find((w) => w.warehouseId === id);
  const block = (label: string, w?: Warehouse) => `<div><div class="k">${label}</div><div class="v">${escapeHtml(w?.name ?? "")}</div><div>${escapeHtml(w?.addressLines ?? "")}</div><div>${escapeHtml(w?.cityProvincePostal ?? "")}</div></div>`;
  const rows = t.items.map((i, n) => `<tr><td>${n + 1}</td><td>${escapeHtml(productName(i.productId))}${i.serialNumbers.length ? `<div class="sn">S/N: ${escapeHtml(i.serialNumbers.join(", "))}</div>` : ""}</td><td class="r">${i.qty}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t.transferNo)}</title><style>
    @page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;font-size:12px;color:#111}h1{font-size:18px;margin:0 0 4px}
    .meta{display:flex;justify-content:space-between;margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
    .k{font-size:10px;text-transform:uppercase;color:#555}.v{font-weight:bold}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}
    .r{text-align:right}.sn{font-size:10px;color:#444}.sign{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}.line{border-top:1px solid #111;padding-top:4px}
  </style></head><body>
    <div class="meta"><div><h1>Stock Transfer Slip</h1><div>${escapeHtml(t.transferNo)}</div></div><div><div class="k">Date</div><div class="v">${escapeHtml(t.date)}</div></div></div>
    <div class="grid">${block("From", wh(t.fromWarehouseId))}${block("To", wh(t.toWarehouseId))}</div>
    <table><thead><tr><th style="width:32px">#</th><th>Item</th><th class="r" style="width:80px">Qty</th></tr></thead><tbody>${rows}</tbody></table>
    ${t.note ? `<p><span class="k">Note</span><br>${escapeHtml(t.note)}</p>` : ""}
    <div class="sign"><div class="line">Prepared by: ${escapeHtml(t.preparedBy)}</div><div class="line">Received by:</div></div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) { toast.error("Allow pop-ups to print the transfer slip."); return; }
  win.document.write(html);
  win.document.close();
}

export default function StockTransfersPage() {
  const warehouses = useActiveWarehouses();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [level, setLevel] = useState<AccessLevel>("view");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [date, setDate] = useState(today());
  const [preparedBy, setPreparedBy] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: number; serialText: string }[]>([{ productId: "", quantity: 1, serialText: "" }]);

  const load = useCallback(
    () => Promise.all([
      api<{ level: AccessLevel; transfers: Transfer[] }>("/api/inventory/transfers"),
      api<{ rows: ProductOption[] }>("/api/inventory"),
    ])
      .then(([t, inv]) => {
        setTransfers(t.transfers);
        setLevel(t.level);
        const seen = new Map<string, ProductOption>();
        for (const r of inv.rows) seen.set(r.productId, { productId: r.productId, productCode: r.productCode, productName: r.productName });
        setProducts([...seen.values()].sort((a, b) => a.productName.localeCompare(b.productName)));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load transfers."))
      .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  const productName = useCallback((id: string) => products.find((p) => p.productId === id)?.productName || id, [products]);
  const warehouseName = (id: string) => warehouses.find((w) => w.warehouseId === id)?.name || id;
  const productOptions = useMemo(() => products.map((p) => ({ value: p.productId, label: `${p.productCode} — ${p.productName}` })), [products]);
  const stock = useStockCheck({ warehouseId: fromId, lines, enabled: open });

  const openCreate = () => {
    setFromId(""); setToId(""); setDate(today()); setPreparedBy(""); setNote("");
    setLines([{ productId: "", quantity: 1, serialText: "" }]);
    setOpen(true);
  };

  const save = async () => {
    const items = lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: l.quantity, serialNumbers: parseSerialInput(l.serialText) }));
    if (!fromId || !toId) { toast.error("Choose both warehouses."); return; }
    if (fromId === toId) { toast.error("Choose two different warehouses."); return; }
    if (!items.length) { toast.error("Add at least one product."); return; }
    const prompt = approvalPrompt(stock.check, stock.level, warehouseName(fromId), productName);
    if (prompt && !window.confirm(prompt)) return;
    setSaving(true);
    try {
      const saved = await api<Transfer>("/api/inventory/transfers", {
        method: "POST",
        body: JSON.stringify({ date, fromWarehouseId: fromId, toWarehouseId: toId, preparedBy, note, items }),
      });
      toast.success(saved.status === "pending_approval" ? "Sent for approval. Stock moves once a manager approves it." : `${saved.transferNo} saved. Stock moved.`);
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save transfer.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (t: Transfer) => {
    if (!window.confirm(`Cancel ${t.transferNo}?${t.status === "created" ? " The stock goes back to the sending warehouse." : ""}`)) return;
    try {
      await api(`/api/inventory/transfers/${encodeURIComponent(t.transferId)}/cancel`, { method: "POST" });
      toast.success(`${t.transferNo} cancelled.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel transfer.");
    }
  };

  const columns: ColumnDef<Transfer>[] = [
    { accessorKey: "transferNo", header: "Transfer no." },
    { accessorKey: "date", header: "Date" },
    { id: "route", header: "From → To", accessorFn: (t) => `${warehouseName(t.fromWarehouseId)} → ${warehouseName(t.toWarehouseId)}` },
    { id: "items", header: "Items", accessorFn: (t) => t.items.map((i) => `${productName(i.productId)} × ${i.qty}`).join(", ") },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={STATUS[row.original.status].variant}>{STATUS[row.original.status].label}</Badge> },
    {
      id: "rowActions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.status === "created" && (
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Print slip" onClick={(e) => { e.stopPropagation(); printSlip(row.original, warehouses, productName); }}>
              <Printer className="h-4 w-4" />
            </Button>
          )}
          {canPerform(level, "transfer:cancel") && (row.original.status === "created" || row.original.status === "pending_approval") && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Cancel transfer" onClick={(e) => { e.stopPropagation(); void cancel(row.original); }}>
              <Ban className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="min-w-0 p-3 sm:p-6">
        <EntityTable
          title="Stock Transfers"
          columns={columns}
          data={transfers}
          loading={loading}
          hideTransferButtons
          headerActions={canPerform(level, "transfer:create") ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New transfer</Button> : undefined}
          getRowId={(t) => t.transferId}
          mobileLayout={{
            primary: ["transferNo", "route", "status", "date"],
            labels: { transferNo: "Transfer no.", date: "Date", route: "From → To", items: "Items", status: "Status", rowActions: "Actions" },
          }}
        />
      </div>

      <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New stock transfer</DialogTitle>
            <DialogDescription>Saving moves the stock immediately, unless it dips into safety stock and needs a manager&apos;s approval.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <WarehouseSelect label="From warehouse" value={fromId} onChange={setFromId} warehouses={warehouses} />
              <WarehouseSelect label="To warehouse" value={toId} onChange={setToId} warehouses={warehouses.filter((w) => w.warehouseId !== fromId)} />
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePickerInput value={date} onChange={setDate} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Prepared by</Label>
                <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Defaults to you" />
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Items</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <SearchableSelect
                        value={line.productId}
                        onValueChange={(v) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: v } : l)))}
                        options={productOptions}
                        placeholder="Select product"
                      />
                    </div>
                    <Input
                      aria-label={`Quantity for item ${idx + 1}`}
                      className="w-24 shrink-0"
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: parseInt(e.target.value) || 0 } : l)))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive"
                      aria-label={`Remove item ${idx + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <DeliverySerialInput
                    index={idx}
                    value={line.serialText}
                    quantity={line.quantity}
                    requiresSerial={false}
                    onChange={(v) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, serialText: v } : l)))}
                  />
                  <StockLineHint check={stock.check} productId={line.productId} warehouseName={warehouseName(fromId)} productName={productName(line.productId)} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { productId: "", quantity: 1, serialText: "" }])}>
                <Plus className="mr-2 h-4 w-4" />Add item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

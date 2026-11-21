"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PickedPoLine } from "@/lib/purchaseRequests/domain";
export type { PickedPoLine };
import { lineName, prApi, salesOrderWarning, type OpenPrLine } from "./api";

export function PrLinePicker({ open, onOpenChange, excludePoNumber, alreadyLinked, onAdd, onLabels }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludePoNumber?: string;
  /** Quantities already linked in the unsaved form, per PR line, subtracted from what can be claimed. */
  alreadyLinked: ReadonlyMap<string, number>;
  onAdd: (lines: PickedPoLine[]) => void;
  /** Reports prItemId → "PR no." labels so the form can show chips. */
  onLabels?: (labels: Map<string, string>) => void;
}) {
  const [rows, setRows] = useState<OpenPrLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [qty, setQty] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!open) return;
    let live = true;
    const url = `/api/purchase-requests/open-lines${excludePoNumber ? `?excludePo=${encodeURIComponent(excludePoNumber)}` : ""}`;
    Promise.resolve().then(() => { if (live) { setLoading(true); setQty(new Map()); } });
    prApi<OpenPrLine[]>(url)
      .then((data) => {
        if (!live) return;
        setRows(data);
        onLabels?.(new Map(data.map((r) => [r.prItemId, r.prNo])));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load purchase requests."))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, excludePoNumber, onLabels]);

  const available = (r: OpenPrLine) => Math.max(0, r.claimable - (alreadyLinked.get(r.prItemId) ?? 0));
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => available(r) > 0 && (!q || [r.prNo, r.reference, r.productCode, r.productName].join(" ").toLowerCase().includes(q)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, alreadyLinked]);

  const toggle = (r: OpenPrLine, on: boolean) => setQty((prev) => { const next = new Map(prev); if (on) next.set(r.prItemId, available(r)); else next.delete(r.prItemId); return next; });

  const add = () => {
    const byProduct = new Map<string, PickedPoLine>();
    for (const r of rows) {
      const q = qty.get(r.prItemId);
      if (!q) continue;
      if (q > available(r)) { toast.error(`${r.prNo} · ${r.productName}: only ${available(r)} left to order.`); return; }
      // Typed items (no product) are never grouped: each becomes its own PO line.
      const key = r.productId || `typed:${r.prItemId}`;
      const group: PickedPoLine = byProduct.get(key) ?? { productId: r.productId, description: r.productName, unit: r.unit, quantity: 0, prLinks: [] };
      group.quantity += q;
      group.prLinks.push({ prItemId: r.prItemId, quantity: q });
      byProduct.set(key, group);
    }
    if (!byProduct.size) { toast.error("Select at least one purchase request line."); return; }
    onAdd([...byProduct.values()]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add from purchase requests</DialogTitle>
          <DialogDescription>Pick open PR lines. The same product from several requests becomes one PO line.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Filter by PR no., SO/contract no. or item" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="w-8 p-2" /><th className="p-2">PR No.</th><th className="p-2">For</th><th className="p-2">Product</th><th className="p-2 text-right">Open</th><th className="w-28 p-2">Qty to order</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
              {!loading && !visible.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No open purchase request lines.</td></tr>}
              {!loading && visible.map((r) => {
                const warn = salesOrderWarning(r.salesOrderStatus);
                const checked = qty.has(r.prItemId);
                return (
                  <tr key={r.prItemId} className="border-t">
                    <td className="p-2"><Checkbox checked={checked} onCheckedChange={(c) => toggle(r, !!c)} aria-label={`Select ${r.prNo} ${r.productName}`} /></td>
                    <td className="p-2">{r.prNo}</td>
                    <td className="p-2">{r.reference || "—"}{warn && <Badge variant="outline" className="ml-1 border-amber-500 text-amber-700 dark:text-amber-400">{warn}</Badge>}</td>
                    <td className="p-2">{lineName({ productCodeSnapshot: r.productCode, productNameSnapshot: r.productName })}</td>
                    <td className="p-2 text-right">{available(r)} {r.unit}</td>
                    <td className="p-2"><Input type="number" min={0} max={available(r)} step="any" disabled={!checked} value={qty.get(r.prItemId) ?? ""} onChange={(e) => setQty((prev) => new Map(prev).set(r.prItemId, Number(e.target.value) || 0))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={add} disabled={!qty.size}>Add to PO</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

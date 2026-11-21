"use client";

import { useState } from "react";
import { Ban, PackageCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PR_STATUS_LABELS } from "@/types/purchaseRequest";
import { lineName, prApi, prReferenceLabel, salesOrderWarning, type PrView } from "./api";

type Line = PrView["lines"][number];
type Action = { kind: "stock" | "cancel"; line: Line; qty: number; text: string };

const n = (v: number) => v.toLocaleString("en-PH", { maximumFractionDigits: 4 });

export function PurchaseRequestDetailDialog({ pr, onClose, onChanged }: { pr: PrView; onClose: () => void; onChanged: (pr: PrView) => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const warn = salesOrderWarning(pr.salesOrderStatus);
  const canAct = pr.status === "SUBMITTED";

  const run = async (url: string, init: RequestInit, done: string) => {
    setBusy(true);
    try {
      onChanged(await prApi<PrView>(url, init));
      toast.success(done);
      setAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitAction = () => {
    if (!action) return;
    const base = `/api/purchase-requests/items/${encodeURIComponent(action.line.prItemId)}`;
    if (action.kind === "stock") void run(`${base}/from-stock`, { method: "POST", body: JSON.stringify({ qty: action.qty, note: action.text }) }, "Marked from stock.");
    else void run(`${base}/cancel`, { method: "POST", body: JSON.stringify({ qty: action.qty, reason: action.text }) }, "Line quantity cancelled.");
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {pr.prNo || "Draft purchase request"}
            <Badge variant="secondary">{PR_STATUS_LABELS[pr.derivedStatus]}</Badge>
            {warn && <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">{warn}</Badge>}
          </DialogTitle>
          <DialogDescription>{[prReferenceLabel(pr), pr.customerNameSnapshot].filter((v) => v && v !== "—").join(" · ") || "No sales order or contract"}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><span className="block text-xs text-muted-foreground">Requested by</span>{pr.requestedByName}</div>
          <div><span className="block text-xs text-muted-foreground">Date requested</span>{pr.requestedDate}</div>
          <div><span className="block text-xs text-muted-foreground">Needed by</span>{pr.neededByDate || "—"}</div>
          {pr.requestType === "SALES_ORDER" && <div><span className="block text-xs text-muted-foreground">Quotation no.</span>{pr.quotationNoSnapshot || "—"}</div>}
          {pr.purpose && <div className="col-span-2 md:col-span-4"><span className="block text-xs text-muted-foreground">Purpose / job notes</span><span className="whitespace-pre-line">{pr.purpose}</span></div>}
          {pr.cancelReason && <div className="col-span-2 md:col-span-4 text-destructive"><span className="block text-xs">Cancel reason</span>{pr.cancelReason}</div>}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Product</th><th className="p-2 text-right">Requested</th><th className="p-2 text-right">Ordered</th>
                <th className="p-2 text-right">On draft PO</th><th className="p-2 text-right">From stock</th><th className="p-2 text-right">Cancelled</th>
                <th className="p-2 text-right">Remaining</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {pr.lines.map((l) => (
                <tr key={l.prItemId} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{lineName(l)}</div>
                    {l.forLabel && <div className="text-xs text-muted-foreground">For {l.forLabel}</div>}
                    {l.remarks && <div className="text-xs text-muted-foreground">{l.remarks}</div>}
                  </td>
                  <td className="p-2 text-right">{n(l.quantity)} {l.unitSnapshot}</td>
                  <td className="p-2 text-right">{n(l.orderedQty)}{l.poNumbers.length > 0 && <div className="text-xs text-muted-foreground">{l.poNumbers.join(", ")}</div>}</td>
                  <td className="p-2 text-right">{n(l.onDraftQty)}</td>
                  <td className="p-2 text-right">{n(l.fromStockQty)}{l.fromStockNote && <div className="text-xs text-muted-foreground">{l.fromStockNote}</div>}</td>
                  <td className="p-2 text-right">{n(l.cancelledQty)}{l.cancelReason && <div className="text-xs text-muted-foreground">{l.cancelReason}</div>}</td>
                  <td className="p-2 text-right font-medium">{n(l.remaining)}</td>
                  <td className="p-2">
                    {canAct && (
                      <div className="flex justify-end gap-1">
                        {l.claimable > 0 && <Button variant="ghost" size="icon" className="h-8 w-8" title="Mark from stock" onClick={() => setAction({ kind: "stock", line: l, qty: l.claimable, text: "" })}><PackageCheck className="h-4 w-4" /></Button>}
                        {l.fromStockQty > 0 && <Button variant="ghost" size="icon" className="h-8 w-8" title="Undo from stock" disabled={busy} onClick={() => { if (window.confirm("Undo the from-stock mark on this line?")) void run(`/api/purchase-requests/items/${encodeURIComponent(l.prItemId)}/from-stock`, { method: "DELETE" }, "From-stock mark removed."); }}><Undo2 className="h-4 w-4" /></Button>}
                        {l.claimable > 0 && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Cancel remaining" onClick={() => setAction({ kind: "cancel", line: l, qty: l.claimable, text: "" })}><Ban className="h-4 w-4" /></Button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {action && (
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[8rem_1fr_auto] md:items-end">
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" min={0} max={action.line.claimable} step="any" value={action.qty} onChange={(e) => setAction({ ...action, qty: Number(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>{action.kind === "stock" ? "Note (e.g. warehouse or stock transfer no.)" : "Reason (required)"}</Label>
              <Input value={action.text} onChange={(e) => setAction({ ...action, text: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Back</Button>
              <Button variant={action.kind === "cancel" ? "destructive" : "default"} onClick={submitAction} disabled={busy}>
                {action.kind === "stock" ? "Mark from stock" : "Cancel quantity"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-3">{action.line.productNameSnapshot}: up to {n(action.line.claimable)} not already on a PO.</p>
          </div>
        )}

        <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

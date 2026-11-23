"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canPerform, type AccessLevel, type LineCheck } from "@/lib/inventory/domain";

interface ApprovalItem {
  kind: "DR" | "TRANSFER";
  id: string;
  label: string;
  date: string;
  warehouseId: string;
  warehouseName: string;
  requestedBy: string;
  preparedBy: string;
  check: { result: string; lines: (LineCheck & { productName: string; warehouseName?: string })[] };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Request failed.");
  return body as T;
}

export default function StockApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [level, setLevel] = useState<AccessLevel>("view");
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<{ item: ApprovalItem; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () => api<{ level: AccessLevel; items: ApprovalItem[] }>("/api/inventory/approvals")
      .then((data) => { setItems(data.items); setLevel(data.level); })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load approvals."))
      .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  const decide = async () => {
    if (!decision) return;
    setSaving(true);
    const { item, action } = decision;
    const url = item.kind === "DR"
      ? `/api/inventory/approvals/dr/${encodeURIComponent(item.id)}`
      : `/api/inventory/approvals/transfer/${encodeURIComponent(item.id)}`;
    try {
      const result = await api<{ drNumber?: number; transferNo?: string }>(url, { method: "POST", body: JSON.stringify({ decision: action, note }) });
      if (action === "reject") toast.success(`${item.label} rejected.`);
      else if (item.kind === "DR") toast.success(`Approved as DR #${result.drNumber}. It can now be printed.`);
      else toast.success(`${result.transferNo ?? "Transfer"} approved. Stock moved.`);
      setDecision(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the decision.");
    } finally {
      setSaving(false);
    }
  };

  const canDecide = canPerform(level, "approval:decide");

  return (
    <div className="min-w-0 space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Stock approvals</h1>
        <p className="text-sm text-muted-foreground">
          Deliveries and transfers that dip into safety stock wait here for a manager.
          {!canDecide && " Only managers and above can approve or reject."}
        </p>
      </div>

      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>}

      <div className="grid gap-3">
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {item.label}
                  <Badge variant="outline" className="ml-2">{item.kind === "DR" ? "Delivery receipt" : "Stock transfer"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.date} · from {item.warehouseName}{item.preparedBy ? ` · prepared by ${item.preparedBy}` : ""}
                </div>
              </div>
              {canDecide && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setNote(""); setDecision({ item, action: "reject" }); }}>
                    <X className="mr-1 h-4 w-4" />Reject
                  </Button>
                  <Button size="sm" onClick={() => { setNote(""); setDecision({ item, action: "approve" }); }}>
                    <Check className="mr-1 h-4 w-4" />Approve
                  </Button>
                </div>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {item.check.lines.map((line) => (
                <li key={`${line.warehouseId}|${line.productId}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {line.productName} × {line.requested}
                    {item.kind === "DR" && line.warehouseName ? <span className="text-muted-foreground"> · {line.warehouseName}</span> : null}
                  </span>
                  <span className={line.result === "blocked" ? "text-destructive" : line.result === "needs_approval" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                    {line.result === "blocked"
                      ? `Not enough stock now: ${line.onHand} on hand`
                      : line.result === "needs_approval"
                        ? `Uses ${line.safetyUsed} of ${line.safetyStock} safety stock`
                        : `${line.available} available`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Dialog open={!!decision} onOpenChange={(open) => { if (!open && !saving) setDecision(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{decision?.action === "approve" ? "Approve" : "Reject"} {decision?.item.label}</DialogTitle>
            <DialogDescription>
              {decision?.action === "approve"
                ? "Stock is checked again first. Once approved, it uses the safety stock shown and goes ahead."
                : "It will not be delivered or moved. The requester can edit and resubmit it."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approval-note">Note (optional)</Label>
            <Textarea id="approval-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={saving}>Cancel</Button>
            <Button variant={decision?.action === "reject" ? "destructive" : "default"} onClick={() => void decide()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decision?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

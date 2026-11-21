"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ContractDueView } from "./api";

export interface PickedContractLine { productId: string; quantity: number; contractItemId: string }

const n = (v: number) => v.toLocaleString("en-PH", { maximumFractionDigits: 4 });

/** Checklist of a contract's active items; rows with something still due start ticked. */
export function ContractItemsPicker({ due, loading, onAdd }: { due: ContractDueView[]; loading: boolean; onAdd: (lines: PickedContractLine[]) => void }) {
  const addable = (d: ContractDueView) => !d.productIssue;
  const [picked, setPicked] = useState<Set<string>>(() => new Set(due.filter((d) => d.dueQty > 0 && addable(d)).map((d) => d.contractItemId)));
  const blocked = due.filter((d) => !addable(d)).length;

  if (loading) return <div className="rounded-md border p-3 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>;
  if (!due.length) return <p className="rounded-md border p-3 text-sm text-muted-foreground">This contract has no active items.</p>;

  const toggle = (id: string, on: boolean) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const add = () => onAdd(due.filter((d) => picked.has(d.contractItemId) && addable(d))
    .map((d) => ({ productId: d.productId, quantity: Math.max(1, d.dueQty), contractItemId: d.contractItemId })));

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="w-8 p-1" /><th className="p-1">Item</th><th className="p-1">Frequency</th><th className="p-1 text-right">Entitled</th><th className="p-1 text-right">Released</th><th className="p-1 text-right">Due</th></tr>
          </thead>
          <tbody>
            {due.map((d) => (
              <tr key={d.contractItemId} className="border-t align-top">
                <td className="p-1"><Checkbox checked={picked.has(d.contractItemId)} disabled={!addable(d)} onCheckedChange={(c) => toggle(d.contractItemId, !!c)} aria-label={`Select ${d.productName}`} /></td>
                <td className="p-1">
                  <div>{d.productName}</div>
                  {d.alreadyRequested.map((r, i) => <div key={i} className="text-xs text-muted-foreground">{n(r.quantity)} already on {r.prNo}</div>)}
                  {d.productIssue && (
                    <div className="text-xs text-destructive">
                      {d.productIssue === "inactive" ? "Its product is inactive." : "Not linked to a product."} Ask an admin to update this contract item to an active product in <a className="underline" href="/dashboard/customer-contracts" target="_blank" rel="noreferrer">Customer Contracts</a>.
                    </div>
                  )}
                </td>
                <td className="p-1">{d.frequency}</td>
                <td className="p-1 text-right">{n(d.entitledQty)}</td>
                <td className="p-1 text-right">{n(d.releasedQty)}</td>
                <td className="p-1 text-right font-medium">{n(d.dueQty)} {d.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {blocked > 0 && <p className="text-xs text-muted-foreground">{blocked} item{blocked === 1 ? "" : "s"} cannot be added until an admin links {blocked === 1 ? "it" : "them"} to an active product.</p>}
      <Button size="sm" disabled={!due.some((d) => picked.has(d.contractItemId) && addable(d))} onClick={add}>Add selected</Button>
    </div>
  );
}

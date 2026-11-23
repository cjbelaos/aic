"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TrackerSyncReport } from "@/lib/serviceInvoiceTracker/sync";

/** Admin button: copies Service Invoices 1801+ to the accounting tracker and shows what changed. */
export default function ServiceInvoiceTrackerSync({ onDone }: { onDone: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<TrackerSyncReport | null>(null);
  const [error, setError] = useState("");

  async function sync() {
    setSyncing(true); setError("");
    try {
      const response = await fetch("/api/service-invoices/tracker-sync", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || "Could not sync the accounting tracker.");
      else setReport(body);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSyncing(false);
      onDone();
    }
  }

  const count = (outcome: string) => report?.results.filter(result => result.outcome === outcome) ?? [];
  const counts = (["added", "updated", "unchanged"] as const).map(outcome => [outcome, count(outcome).length] as const).filter(([, n]) => n > 0);
  const review = count("needs_review");
  const failed = count("failed");

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={syncing} onClick={sync}>
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync to tracker"}
      </Button>
      <Dialog open={!!report || !!error} onOpenChange={open => { if (!open) { setReport(null); setError(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{error ? "Tracker sync stopped" : "Tracker sync finished"}</DialogTitle></DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : (
            <div className="space-y-3 text-sm">
              {counts.length > 0 && <p>{counts.map(([outcome, n]) => `${n} ${outcome}`).join(", ")}</p>}
              {!!report?.customersAdded.length && (
                <p>{report.customersAdded.length} customers added to Client Directory: {report.customersAdded.join(", ")}</p>
              )}
              {review.length > 0 && (
                <div>
                  <p className="font-medium">{review.length} need review</p>
                  <ul className="list-disc pl-5 text-muted-foreground">{review.map(r => <li key={r.invoiceNo}>SI {r.invoiceNo} — {r.reason}</li>)}</ul>
                </div>
              )}
              {failed.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">{failed.length} failed</p>
                  <ul className="list-disc pl-5 text-muted-foreground">{failed.map(r => <li key={r.invoiceNo}>SI {r.invoiceNo} — {r.reason}</li>)}</ul>
                </div>
              )}
              {!report?.results.length && <p>No Service Invoices from 1801 onward to copy.</p>}
            </div>
          )}
          <DialogFooter><Button type="button" onClick={() => { setReport(null); setError(""); }}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

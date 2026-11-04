"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import quotationService from "@/lib/services/quotation.service";
import type { QuotationHistoryEntry } from "@/types/quotation-history";
import { BusinessDocumentPrintFrame } from "./business-document-print-frame";
import { QuotationPrintDocument } from "./quotation-print-document";

export function QuotationHistoryModal({ quotationNo, onClose }: { quotationNo: string; onClose: () => void }) {
  const [entries, setEntries] = useState<QuotationHistoryEntry[]>([]);
  const [selected, setSelected] = useState<QuotationHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSnapshot, setShowSnapshot] = useState(false);
  useEffect(() => {
    let active = true;
    quotationService.getHistory(quotationNo).then(history => {
      if (!active) return;
      setEntries(history);
      setSelected(history.find(entry => entry.state === "SENT" || entry.state === "LEGACY") || null);
    }).catch(() => { if (active) setError("Unable to load quotation history. Close and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quotationNo]);
  const sent = entries.filter(entry => entry.state === "SENT" || entry.state === "LEGACY");
  const unresolved = entries.some(entry => entry.state === "SENDING" || entry.state === "UNCERTAIN");
  const fileId = selected?.file?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || selected?.file?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[95vw] flex-col p-4 sm:max-w-none sm:p-6">
      <DialogHeader><DialogTitle>Sent quotation history — {quotationNo}</DialogTitle></DialogHeader>
      {loading ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : <>
        {unresolved && <p role="alert" className="rounded-md border p-3 text-sm">A send attempt needs delivery verification. Check whether the client received it before attempting another send.</p>}
        {sent.length === 0 && <p className="text-sm text-muted-foreground">No preserved sent versions are available yet.</p>}
        {sent.length > 0 && <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2 overflow-y-auto">
            {sent.map(entry => <button key={entry.sendId} type="button" onClick={() => { setSelected(entry); setShowSnapshot(false); }} aria-pressed={selected?.sendId === entry.sendId} className={`w-full rounded-md border p-3 text-left text-sm ${selected?.sendId === entry.sendId ? "bg-muted" : "bg-background"}`}>
              <p className="font-semibold">{entry.revision > 0 ? `Revision ${entry.revision}` : "Original quotation"}</p>
              <p>{entry.sentAt ? new Date(entry.sentAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "Historical send time unavailable"}</p>
              <p className="break-words">Sent by: {entry.sentBy || "Unknown"}</p>
              <p className="break-words">To: {entry.recipient || "Unknown"}</p>
              {entry.snapshot.emailRecipients && <p className="break-words">CC: {entry.snapshot.emailRecipients.cc.join(", ") || "None"}</p>}
              {entry.state === "LEGACY" && <p className="mt-1 text-xs text-muted-foreground">Preserved legacy version; some original details were not stored.</p>}
            </button>)}
          </div>
          {selected && <div className="flex min-h-48 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {selected.file && <Button asChild size="sm" variant="outline"><a href={selected.file} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Open sent PDF</a></Button>}
              {selected.file && selected.snapshot && <Button size="sm" variant="outline" onClick={() => setShowSnapshot(!showSnapshot)}>{showSnapshot ? "View sent PDF" : "View saved details"}</Button>}
            </div>
            <div className="min-h-48 flex-1 overflow-hidden rounded-md border">
              {selected.file && !showSnapshot ? <iframe title={`Sent quotation ${quotationNo} revision ${selected.revision}`} className="h-full w-full border-0" src={fileId ? `https://drive.google.com/file/d/${fileId}/preview` : selected.file} /> : selected.snapshot ? <BusinessDocumentPrintFrame title={`Historical quotation ${quotationNo}`}><QuotationPrintDocument quotation={{ ...selected.snapshot, revision: selected.revision, revisionPending: false }} /></BusinessDocumentPrintFrame> : <p className="p-4 text-sm">Original details are unavailable.</p>}
            </div>
          </div>}
        </div>}
      </>}
    </DialogContent>
  </Dialog>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { liquidationService } from "@/lib/services/liquidation.service";
import { getLiquidationReturnAmount, manilaToday, validateReturnDate } from "@/lib/liquidation-returns";
import type { Liquidation } from "@/types/liquidation";

export function LiquidationReturnDialog({ liquidation, onClose, onSaved }: {
  liquidation: Liquidation;
  onClose: () => void;
  onSaved: (updated: Liquidation) => void;
}) {
  const [date, setDate] = useState(liquidation.returnDate || "");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const editable = liquidation.canRecordReturn === true;
  const recorded = !!liquidation.returnDate && !!liquidation.returnEvidenceFileId;
  const evidenceUrl = `/api/liquidations/returns?liquidationId=${encodeURIComponent(liquidation.liquidationId)}&evidence=true&v=${encodeURIComponent(liquidation.returnUpdatedAt || "")}`;
  const amount = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(getLiquidationReturnAmount(liquidation));

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function selectFile(selected?: File) {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("Choose a JPEG, PNG or WebP screenshot/photo."); return;
    }
    if (selected.size === 0 || selected.size > 10 * 1024 * 1024) {
      setError("Choose an image up to 10 MB."); return;
    }
    setError(""); setFile(selected); setPreview(URL.createObjectURL(selected));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editable || saving) return;
    setError("");
    try {
      validateReturnDate(date);
      if (!file && !liquidation.returnEvidenceFileId) throw new Error("Attach a screenshot or photo of the return.");
      setSaving(true);
      const updated = await liquidationService.recordReturn(liquidation.liquidationId, date, file);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the return. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editable ? (recorded ? "Edit Return" : "Record Return") : "Cash Return Details"}</DialogTitle>
          <DialogDescription>
            {liquidation.controlNo || "Expense liquidation"} · {recorded ? "Returned" : "Not yet recorded"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">Full amount {recorded ? "returned" : "to return"}</p>
            <p className="text-xl font-semibold">{amount}</p>
            {editable && <p className="mt-1 text-sm text-muted-foreground">Record this only after returning the full amount to the CFO.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-return-date">Actual return date{editable ? " (required)" : ""}</Label>
            {editable ? <Input id="cash-return-date" type="date" required min="1900-01-01" max={manilaToday()}
              value={date} onChange={e => setDate(e.target.value)} disabled={saving} /> :
              <p id="cash-return-date" className="text-sm">{date || "Not yet recorded"}</p>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Screenshot or photo{editable ? " (required)" : ""}</p>
            {editable && <>
              <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload return evidence"
                onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take return evidence photo"
                onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={saving} onClick={() => uploadRef.current?.click()}><Upload className="mr-2 size-4" />Upload Image</Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => cameraRef.current?.click()}><Camera className="mr-2 size-4" />Take Photo</Button>
              </div>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 10 MB.{recorded ? " Keep the current evidence or select a replacement." : ""}</p>
            </>}
            {(preview || liquidation.returnEvidenceFileId) ? <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Private authenticated image and local file preview. */}
              <img src={preview || evidenceUrl} alt="Evidence of the cash return" className="max-h-64 w-full rounded-md border object-contain" />
              <p className="break-all text-xs text-muted-foreground">{file?.name || liquidation.returnEvidenceName}</p>
              {!file && <a href={evidenceUrl} target="_blank" rel="noreferrer" className="text-sm underline">Open evidence</a>}
            </> : <p className="text-sm text-muted-foreground">No evidence recorded.</p>}
          </div>
          {liquidation.returnUpdatedAt && <p className="text-xs text-muted-foreground">
            Last updated by {liquidation.returnUpdatedBy} on {new Date(liquidation.returnUpdatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time).
          </p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>{editable ? "Cancel" : "Close"}</Button>
            {editable && <Button type="submit" disabled={saving || !date || (!file && !liquidation.returnEvidenceFileId)}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}{saving ? "Saving…" : recorded ? "Save Changes" : "Mark as Returned"}
            </Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

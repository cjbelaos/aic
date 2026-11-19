"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import deliveryService from "@/lib/services/delivery.service";
import { formatSerialCell, parseSerialInput } from "@/lib/deliverySerials";
import type { DeliveryReceiptSummary } from "@/types/deliveryReceipt";

/** Serial-only editor for a DR whose other fields are locked (e.g. Completed). */
export function EditDrSerialsDialog({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: DeliveryReceiptSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) onClose(); }}>
      {receipt && <EditDrSerialsBody key={receipt.drNumber} receipt={receipt} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditDrSerialsBody({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: DeliveryReceiptSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [texts, setTexts] = useState(() => receipt.items.map((item) => formatSerialCell(item.serialNumbers ?? [])));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updates = receipt.items.flatMap((item, index) =>
        item.deliveryReceiptItemId
          ? [{ deliveryReceiptItemId: item.deliveryReceiptItemId, serialNumbers: parseSerialInput(texts[index] ?? "") }]
          : [],
      );
      await deliveryService.updateSerials(receipt.drNumber, updates);
      toast.success(`Serials saved for DR #${receipt.drNumber}.`);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save serials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[40rem] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit serials — DR #{receipt.drNumber}</DialogTitle>
        <DialogDescription>Only serial numbers can be changed on this delivery receipt.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {receipt.items.map((item, index) => (
          <label key={item.deliveryReceiptItemId ?? index} className="block space-y-1">
            <span className="block text-sm">
              <span className="tabular-nums text-muted-foreground">{item.quantity}×</span>{" "}
              {item.description || item.productCode || "—"}
            </span>
            <Textarea
              aria-label={`Serial numbers for item ${index + 1}`}
              className="min-h-9 py-1.5 text-sm"
              rows={1}
              value={texts[index] ?? ""}
              disabled={saving || !item.deliveryReceiptItemId}
              placeholder={item.deliveryReceiptItemId ? "Comma or one per line" : "Older line, serials cannot be edited here"}
              onChange={(e) => setTexts((prev) => prev.map((text, i) => (i === index ? e.target.value : text)))}
            />
          </label>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save serials
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

"use client";

import { useRef, useState } from "react";
import { Printer, Save, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import deliveryService from "@/lib/services/delivery.service";
import { DeliveryReceiptResponse } from "@/types/deliveryReceipt";

interface Props {
  dr: DeliveryReceiptResponse | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DeliveryReceiptPreviewModal({ dr, open, onOpenChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);

  if (!dr) return null;

  // Build blob URL from base64 PDF, or fall back to printUrl
  const pdfSrc = dr.pdfBase64
    ? `data:application/pdf;base64,${dr.pdfBase64}`
    : dr.printUrl || "";

  const handlePrint = () => {
    // Base64 → Blob → object URL gives us a same-origin PDF we can reliably print.
    if (dr.pdfBase64) {
      try {
        const byteCharacters = atob(dr.pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);

        const printWindow = window.open(blobUrl, "_blank");
        if (printWindow) {
          printWindow.addEventListener("load", () => {
            printWindow.focus();
            printWindow.print();
          });
        } else {
          toast.error(
            "Popup blocked. Please allow popups or use \"Open in Sheets\" to print.",
          );
        }
        return;
      } catch (e) {
        console.warn("Failed to print from base64, falling back:", e);
      }
    }

    // Fallback: try iframe print, then open the Sheets print URL
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.print();
        return;
      } catch {
        // cross-origin — fall through to open print URL
      }
    }

    if (dr.printUrl) {
      window.open(dr.printUrl, "_blank");
    } else {
      toast.error("Unable to print. No PDF source available.");
    }
  };

  const handleSaveToDrive = async () => {
    setSaving(true);
    try {
      const result = await deliveryService.savePdfToDrive(
        dr.drNumber,
        dr.companyName,
        dr.date,
      );
      toast.success("Delivery Receipt saved to Google Drive.", {
        action: {
          label: "Open",
          onClick: () => window.open(result.fileLink, "_blank"),
        },
      });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save DR PDF to Drive.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Delivery Receipt — DR #{dr.drNumber}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {dr.companyName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* PDF Preview */}
        <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
          {pdfSrc ? (
            <iframe
              ref={iframeRef}
              src={pdfSrc}
              className="w-full h-full"
              title="Delivery Receipt PDF"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Unable to load PDF preview.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {dr.printUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(dr.printUrl, "_blank")}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open in Sheets
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!pdfSrc}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
          <Button
            size="sm"
            onClick={handleSaveToDrive}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save to Drive
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import { Printer, Save, Loader2, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
  const [printSaving, setPrintSaving] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const router = useRouter();

  if (!dr) return null;

  // Build blob URL from base64 PDF, or fall back to printUrl
  const pdfSrc = dr.pdfBase64
    ? `data:application/pdf;base64,${dr.pdfBase64}`
    : dr.printUrl || "";

  const handlePrint = async () => {
    // Auto-save PDF to Drive before printing. Block print if save fails.
    setPrintSaving(true);
    try {
      await deliveryService.savePdfToDrive(dr.drNumber, dr.companyName, dr.date);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save DR PDF to Drive. Print aborted.",
      );
      setPrintSaving(false);
      return;
    }
    setPrintSaving(false);

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
    setDriveSaving(true);
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
      setDriveSaving(false);
    }
  };

  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[95vw] sm:max-w-none h-[92vh] max-h-[92vh] p-6 flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between pr-6">
          <span className="text-lg font-bold">
            Delivery Receipt — DR #{dr.drNumber}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {dr.companyName}
          </span>
        </DialogTitle>
      </DialogHeader>

      {/* PDF Preview Container */}
      <div className="flex-1 min-h-0 w-full my-2 border rounded-md overflow-hidden bg-muted/20">
        {pdfSrc ? (
          <iframe
            ref={iframeRef}
            src={pdfSrc}
            className="w-full h-full border-none"
            title="Delivery Receipt PDF"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Unable to load PDF preview.
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-2 pt-1 shrink-0">
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
          disabled={!pdfSrc || printSaving || driveSaving}
        >
          {printSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-1.5 h-4 w-4" />
          )}
          {printSaving ? "Saving…" : "Print"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            sessionStorage.setItem(
              "siPrefill",
              JSON.stringify({ drNumber: dr.drNumber, companyName: dr.companyName }),
            );
            router.push("/dashboard/service-invoices");
          }}
          title="Create a Service Invoice for this DR"
        >
          <FileText className="mr-1.5 h-4 w-4" />
          Create SI
        </Button>
        <Button
          size="sm"
          onClick={handleSaveToDrive}
          disabled={printSaving || driveSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {driveSaving ? (
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

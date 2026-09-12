"use client";

import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { BusinessDocumentPrintFrame, type BusinessDocumentPrintHandle } from "./business-document-print-frame";
import { DeliveryReceiptPrintDocument } from "./delivery-receipt-print-document";
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
  onSaved?: () => void;
}

export function DeliveryReceiptPreviewModal({ dr: initialDr, open, onOpenChange, onSaved }: Props) {
  const printFrame = useRef<BusinessDocumentPrintHandle>(null);
  const [legacy, setLegacy] = useState(false);
  const [printSaving, setPrintSaving] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [saved, setSaved] = useState<{ source: DeliveryReceiptResponse; value: DeliveryReceiptResponse } | null>(null);
  const dr = saved?.source === initialDr ? saved.value : initialDr;
  const router = useRouter();

  if (!dr) return null;

  const handlePrint = async () => {
    setPrintSaving(true);
    try {
      await printFrame.current?.print();
      // The browser cannot tell us whether the user printed or cancelled.
    } catch {
      toast.error("Unable to prepare the receipt. Please reopen the preview and try again.");
    } finally {
      setPrintSaving(false);
    }
  };

  const handleSaveToDrive = async () => {
    setDriveSaving(true);
    try {
      const { generateDeliveryReceiptPdfBase64 } = await import("@/lib/deliveryReceiptPdf");
      const latest = await deliveryService.getPreview(dr.drNumber);
      const pdfBase64 = await generateDeliveryReceiptPdfBase64(latest);
      const result = await deliveryService.savePdfToDrive(
        dr.drNumber,
        latest.companyName,
        latest.date,
        pdfBase64,
      );
      setSaved({ source: initialDr!, value: { ...latest, driveFileLink: result.fileLink } });
      onSaved?.();
      toast.success("Delivery Receipt PDF saved to Google Drive.", {
        action: {
          label: "Open",
          onClick: () => window.open(result.fileLink, "_blank"),
        },
      });
    } catch (err: unknown) {
      toast.error(
        (isAxiosError(err) ? err.response?.data?.error : undefined) ||
          (err instanceof Error ? err.message : undefined) ||
          "Failed to save DR PDF to Drive.",
      );
    } finally {
      setDriveSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-none h-[92dvh] max-h-[92dvh] p-3 sm:p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between pr-6">
            <span className="text-lg font-bold">
              Delivery Receipt —{" "}
              {dr.drNumber > 0 ? `DR #${dr.drNumber}` : "Draft DR"}
            </span>
            <span className="max-w-full break-words text-sm font-medium text-muted-foreground">
              {dr.companyName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* PDF Preview Container */}
        <div className="dr-preview-document order-2 flex-1 min-h-48 w-full my-2 border rounded-md overflow-hidden bg-muted/20">
          {legacy ? (
            <iframe src={dr.pdfBase64 ? `data:application/pdf;base64,${dr.pdfBase64}` : dr.printUrl} className="w-full h-full border-none" title="Previous Delivery Receipt format" />
          ) : (
            <BusinessDocumentPrintFrame ref={printFrame} title={`Delivery Receipt ${dr.drNumber}`}><DeliveryReceiptPrintDocument dr={dr} /></BusinessDocumentPrintFrame>
          )}
        </div>

        <div className="order-0 rounded-md border bg-muted/30 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">Receipt details</p><p className="text-xs text-muted-foreground">Review the latest saved items before printing or updating Drive.</p></div><Button className="self-start" variant="outline" size="sm" disabled={printSaving || driveSaving || (!legacy && !dr.pdfBase64 && !dr.printUrl)} onClick={() => setLegacy(!legacy)}>{legacy ? "Use new A4 format" : "View previous format"}</Button></div></div>
        <p className="order-1 text-xs text-muted-foreground">Print opens the print dialog. Drive saving uses the latest saved document. Switch to the new format to save.</p>
        {/* Action Footer */}
        <div className="dr-preview-actions order-1 grid grid-cols-2 sm:flex sm:flex-wrap items-center sm:justify-end gap-2 pt-1 shrink-0 [&>button]:whitespace-normal [&>button]:h-auto">
          {legacy && dr.printUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(dr.printUrl, "_blank")}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open previous template
            </Button>
          )}
          {dr.driveFileLink && <Button variant="outline" size="sm" onClick={() => window.open(dr.driveFileLink, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-1.5 h-4 w-4" />Open in Drive</Button>}
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={legacy || printSaving || driveSaving}
          >
            {printSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-4 w-4" />
            )}
            {printSaving ? "Preparing..." : "Print"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sessionStorage.setItem(
                "siPrefill",
                JSON.stringify({
                  drNumber: dr.drNumber,
                  companyName: dr.companyName,
                }),
              );
              router.push("/dashboard/service-invoices");
            }}
            title="Create a Service Invoice for this DR"
          >
            <FileText className="mr-1.5 h-4 w-4" />
            Create SR
          </Button>
          <Button
            size="sm"
            onClick={handleSaveToDrive}
            disabled={legacy || printSaving || driveSaving}
            variant="outline"
          >
            {driveSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {dr.driveFileLink ? "Update Drive PDF" : "Save to Drive"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

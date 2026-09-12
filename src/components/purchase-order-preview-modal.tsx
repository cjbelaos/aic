"use client";

import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { BusinessDocumentPrintFrame, type BusinessDocumentPrintHandle } from "./business-document-print-frame";
import { PurchaseOrderPrintDocument } from "./purchase-order-print-document";
import { Printer, Save, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { generatePurchaseOrderPdfBase64, generateLegacyPurchaseOrderPdfBase64 } from "@/lib/purchaseOrderPdf";
import purchaseOrderService from "@/lib/services/purchase-order.service";
import { PurchaseOrderResponse } from "@/types/purchaseOrder";

interface Props {
  po: PurchaseOrderResponse | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Convert a base64 PDF to an object URL and open it in a new tab with print. */
function openPrintablePdf(base64: string) {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i =  0; i < byteCharacters.length; i++) {

      byteNumbers[i] = byteCharacters.charCodeAt(i );
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob );
    const printWindow = window.open(blobUrl, "_blank");
  if (printWindow) {
      printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
      });
    } else {
      toast.error(
        'Popup blocked. Please allow popups or use the on-screen preview to review the form.',
      );
    }
  } catch {
    toast.error("Failed to prepare the PDF for printing.");
  }
}

export function PurchaseOrderPreviewModal({ po: initialPo, open, onOpenChange }: Props) {
  const printFrame = useRef<BusinessDocumentPrintHandle>(null);
  const [legacy, setLegacy] = useState(false);
  const [printSaving, setPrintSaving] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);

  const [saved, setSaved] = useState<{ source: PurchaseOrderResponse; value: PurchaseOrderResponse } | null>(null);
  const po = saved?.source === initialPo ? saved.value : initialPo;
  if (!po) return null;

  const handleLegacyPrint = async () => {
    setPrintSaving(true);
    try {
      const pdfBase64 = await generateLegacyPurchaseOrderPdfBase64(po);
      openPrintablePdf(pdfBase64 );
    } catch (err: unknown) {
      toast.error(
        (isAxiosError(err) ? err.response?.data?.error : undefined) ||
          (err instanceof Error ? err.message : undefined) ||
          "Failed to prepare the previous PO format."
      );
    } finally {
      setPrintSaving(false );
    }
  };

  const handlePrint = async () => {
    if (legacy) return handleLegacyPrint();
    setPrintSaving(true);
    try { await printFrame.current?.print(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Unable to print purchase order."); }
    finally { setPrintSaving(false); }
  };

  const handleSaveToDrive = async () => {
    setDriveSaving(true );
    try {
      const latest = await purchaseOrderService.getPreview(po.poNumber);
      const pdfBase64 = await generatePurchaseOrderPdfBase64(latest);
      const result = await purchaseOrderService.savePdfToDrive({
        poNumber: po.poNumber,
        supplierName: latest.supplierName,
        date: latest.date,
        pdfBase64,
      });
      setSaved({ source: initialPo!, value: { ...latest, driveFileLink: result.fileLink } });
      toast.success("Purchase Order PDF saved to Google Drive.", {
        action: {
          label: "Open",
          onClick: () => window.open(result.fileLink, "_blank"),
        },
      });
    } catch (err: unknown) {
      toast.error(
        (isAxiosError(err) ? err.response?.data?.error : undefined) ||
          (err instanceof Error ? err.message : undefined) ||
          "Failed to save PO PDF to Drive."
      );
    } finally {
      setDriveSaving(false );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-none h-[92vh] max-h-[92vh] p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span className="text-lg font-bold">
              Purchase Order —{" "}
              {po.poNumber && !po.poNumber.startsWith("DRAFT-")
                ? `#${po.poNumber}`
                : "Draft PO"}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {po.supplierName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* HTML form preview — same layout as the generated PDF */}
        <div className="flex-1 min-h-0 w-full my-2 overflow-auto border rounded-md bg-muted/20 p-4">
          {legacy ? <PurchaseOrderForm po={po} minRows={6} /> : <BusinessDocumentPrintFrame ref={printFrame} title={`Purchase Order ${po.poNumber}`}><PurchaseOrderPrintDocument po={po} /></BusinessDocumentPrintFrame>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={printSaving || driveSaving} onClick={() => setLegacy(!legacy)}>{legacy ? "Use new A4 format" : "View previous format"}</Button>
          <p className="text-xs text-muted-foreground">Print opens the print dialog. Drive saving uses the latest saved document. Switch to the new format to save.</p>
        </div>
        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1 shrink-0">
          {po.driveFileLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(po.driveFileLink!, "_blank")}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open in Drive
            </Button>
          )}
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={printSaving || driveSaving}
          >
            {printSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-4 w-4" />
            )}
            {printSaving ? "Preparing..." : legacy ? "Print previous format" : "Print"}
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
            {po.driveFileLink ? "Update Drive PDF" : "Save to Drive"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
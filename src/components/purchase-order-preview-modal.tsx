"use client";

import { useState } from "react";
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
import { generatePurchaseOrderPdfBase64 } from "@/lib/purchaseOrderPdf";
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
  } catch (e) {
    toast.error("Failed to prepare the PDF for printing.");
  }
}

export function PurchaseOrderPreviewModal({ po, open, onOpenChange }: Props) {
  const [printSaving, setPrintSaving] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);

  if (!po) return null;

  const handlePrint = async () => {
    // Persist the PDF to Drive first (same behaviour as the previous Sheets-based modal).
    setPrintSaving(true );
    try {
      const pdfBase64 = await generatePurchaseOrderPdfBase64(po );
      await purchaseOrderService.savePdfToDrive({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        date: po.date,
        pdfBase64,
      });
      // Mark PO as "printed" once the PDF is saved (non-fatal if update fails).
      if (!po.poNumber.startsWith("DRAFT-")) {
        await purchaseOrderService
          .update(po.poNumber, { status: "printed" })
          .catch(() => {
            // status update is best-effort — don't block the print action
          });
      }
      openPrintablePdf(pdfBase64 );
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save PO PDF to Drive. Print aborted."
      );
    } finally {
      setPrintSaving(false );
    }
  };

  const handleSaveToDrive = async () => {
    setDriveSaving(true );
    try {
      const pdfBase64 = await generatePurchaseOrderPdfBase64(po );
      const result = await purchaseOrderService.savePdfToDrive({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        date: po.date,
        pdfBase64,
      });
      toast.success("Purchase Order saved to Google Drive.", {
        action: {
          label: "Open",
          onClick: () => window.open(result.fileLink, "_blank"),
        },
      });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
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
          <PurchaseOrderForm po={po} minRows={6} />
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-2 pt-1 shrink-0">
          {po.driveFileLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(po.driveFileLink!, "_blank")}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open PDF
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={printSaving || driveSaving}
          >
            {printSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-4 w-4" />
            )}
            {printSaving ? "Saving…" : "Print"}
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
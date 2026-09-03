"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, Save, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import serviceInvoiceService from "@/lib/services/service-invoice.service";
import { ServiceInvoiceResponse } from "@/types/serviceInvoice";
import ServiceInvoicePrintDocument from "@/components/service-invoice-print-document";

interface Props {
  si: ServiceInvoiceResponse | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ServiceInvoicePreviewModal({ si, open, onOpenChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [printSaving, setPrintSaving] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [htmlPrinting, setHtmlPrinting] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"sheets" | "html">("html");

  // Printing always uses the HTML print document (ServiceInvoicePrintDocument).
  // The Sheets PDF view stays available for reference, but is never the default.
  useEffect(() => {
    if (si) {
      setLayoutMode("html");

    }
  }, [si]);

  if (!si) return null;

  // Build blob URL from base64 PDF, or fall back to printUrl
  const pdfSrc = si.pdfBase64
    ? `data:application/pdf;base64,${si.pdfBase64}`
    : si.printUrl || "";

  const handlePrint = async () => {
    // HTML layout mode: render the React document to a letter PDF and print it
    // without touching the Google Sheets template or Drive.
    if (layoutMode === "html") {
      await handleHtmlPrint();
      return;
    }

    // Auto-save PDF to Drive before printing. Cancel print if save fails.
    setPrintSaving(true);
    try {
      await serviceInvoiceService.savePdfToDrive(
        si.invoiceNo,
        si.companyName,
        si.date,
      );
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save Service Invoice PDF to Drive. Print aborted.",
      );
      setPrintSaving(false);
      return;
    }
    setPrintSaving(false);

    // Base64 → Blob → object URL gives us a same-origin PDF we can reliably print.
    if (si.pdfBase64) {
      try {
        const byteCharacters = atob(si.pdfBase64);
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
            'Popup blocked. Please allow popups or use "Open in Sheets" to print.',
          );
        }
        return;
      } catch (e) {
        console.warn("Failed to print from base64, falling back:", e);
      }
    }

    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.print();
        return;
      } catch {
        // cross-origin — fall through to open print URL
      }
    }

    if (si.printUrl) {
      window.open(si.printUrl, "_blank");
    } else {
      toast.error("Unable to print. No PDF source available.");
    }
  };

  /**
   * HTML layout mode: renders #si-html-content to a letter-size PDF via
   * html2canvas + jsPDF, then opens it in a new tab and triggers the browser
   * print dialog. The Google Sheets template is never modified in this mode.
   */
  const handleHtmlPrint = async () => {
    const element = document.getElementById("si-html-content");
    if (!element) {
      toast.error("HTML document not found.");
      return;
    }

    setHtmlPrinting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      // Capture the on-screen document node (same pattern the FTI module uses).
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 900,
        windowHeight: element.scrollHeight,
      });

      // A4 page, full-bleed — matches the printed form / Sheets A4 export.
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const fittedHeight = Math.min(imgHeight, pageHeight);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, fittedHeight);

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.addEventListener("load", () => {
          printWindow.focus();
          printWindow.print();
        });
      } else {
        toast.error(
          'Popup blocked. Please allow popups or use the on-screen preview to review the layout.',
        );
      }
    } catch (e) {
      console.warn("HTML PDF generation failed:", e);
      toast.error("Failed to generate HTML PDF.");
    } finally {
      setHtmlPrinting(false);
    }
  };

  const handleSaveToDrive = async () => {
    setDriveSaving(true);
    try {
      const result = await serviceInvoiceService.savePdfToDrive(
        si.invoiceNo,
        si.companyName,
        si.date,
      );
      toast.success("Service Invoice saved to Google Drive.", {
        action: {
          label: "Open",
          onClick: () => window.open(result.fileLink, "_blank"),
        },
      });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save Service Invoice PDF to Drive.",
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
              Service Invoice — #{si.invoiceNo}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {si.companyName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Document Container — current Sheets PDF vs HTML test layout */}
        <div className="flex-1 min-h-0 w-full my-2 border rounded-md overflow-hidden bg-muted/20">
          {layoutMode === "sheets" ? (
            pdfSrc ? (
              <iframe
                ref={iframeRef}
                src={pdfSrc}
                className="w-full h-full border-none"
                title="Service Invoice PDF"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Unable to load PDF preview. Try the HTML Test layout instead.
              </div>
            )
          ) : (
            <div className="w-full h-full overflow-auto bg-slate-200 p-4">
              <ServiceInvoicePrintDocument si={si} id="si-html-content" />
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between gap-2 pt-1 shrink-0">
          {/* Layout source toggle — keep both so you can compare approaches */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Layout:</span>
            <Button
              variant={layoutMode === "sheets" ? "default" : "outline"}
              size="sm"
              onClick={() => setLayoutMode("sheets")}
              disabled={
                printSaving ||
                driveSaving ||
                htmlPrinting ||
                !pdfSrc
              }
            >
              Current PDF
            </Button>
            <Button
              variant={layoutMode === "html" ? "default" : "outline"}
              size="sm"
              onClick={() => setLayoutMode("html")}
              disabled={printSaving || driveSaving || htmlPrinting}
            >
              HTML Print
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {layoutMode === "sheets" && si.printUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(si.printUrl, "_blank")}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open in Sheets
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={
                printSaving ||
                driveSaving ||
                htmlPrinting ||
                (layoutMode === "sheets" && !pdfSrc)
              }
            >
              {printSaving || htmlPrinting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1.5 h-4 w-4" />
              )}
              {htmlPrinting
                ? "Rendering…"
                : printSaving
                  ? "Saving…"
                  : "Print"}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveToDrive}
              disabled={printSaving || driveSaving || htmlPrinting}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

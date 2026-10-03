"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ServiceInvoicePrintDocument from "@/components/service-invoice-print-document";
import { PAYMENT_LABELS } from "@/lib/serviceInvoiceTracking";
import { resolveUserSignatureUrls, signerNameKey } from "@/lib/userSignatures";
import type { ServiceInvoiceResponse } from "@/types/serviceInvoice";

interface Props { si: ServiceInvoiceResponse | null; open: boolean; onOpenChange: (value: boolean) => void }

export function ServiceInvoicePreviewModal({ si, open, onOpenChange }: Props) {
  const [printing, setPrinting] = useState(false);
  const [signature, setSignature] = useState<{ invoiceNo: string; url: string } | null>(null);

  useEffect(() => {
    if (!si) return;
    let active = true;
    resolveUserSignatureUrls([si.preparedBy])
      .then((urls) => { if (active) setSignature({ invoiceNo: si.invoiceNo, url: urls[signerNameKey(si.preparedBy)] || "" }); })
      .catch(() => { if (active) setSignature({ invoiceNo: si.invoiceNo, url: "" }); });
    return () => { active = false; };
  }, [si]);

  if (!si) return null;

  const money = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  const printable = si.status === "created";

  const handlePrint = async () => {
    const element = document.getElementById("si-html-content");
    if (!element) {
      toast.error("Invoice print preview is still loading. Please try again.");
      return;
    }

    setPrinting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 900,
        windowHeight: element.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const width = pdf.internal.pageSize.getWidth();
      const height = Math.min((canvas.height * width) / canvas.width, pdf.internal.pageSize.getHeight());
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
      const url = URL.createObjectURL(pdf.output("blob"));
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        URL.revokeObjectURL(url);
        toast.error("Popup blocked. Please allow popups to print the invoice.");
        return;
      }
      printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
      });
    } catch (error) {
      console.error("Service Invoice print generation failed:", error);
      toast.error("Failed to prepare the Service Invoice for printing.");
    } finally {
      setPrinting(false);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[95vw] sm:max-w-none h-[92dvh] max-h-[92dvh] flex flex-col p-3 sm:p-6">
    <DialogHeader><DialogTitle>Service Invoice #{si.invoiceNo}</DialogTitle></DialogHeader>
    <div className="min-h-0 flex-1 overflow-auto space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted-foreground">Customer</dt><dd>{si.companyName}</dd></div>
        <div><dt className="text-muted-foreground">Invoice date</dt><dd>{si.date}</dd></div>
        <div><dt className="text-muted-foreground">Invoice status</dt><dd className="capitalize">{si.status}</dd></div>
        <div><dt className="text-muted-foreground">Payment</dt><dd>{PAYMENT_LABELS[si.paymentStatus ?? "unpaid"]}</dd></div>
        <div><dt className="text-muted-foreground">PO number</dt><dd>{si.poNo || "None"}</dd></div>
        <div><dt className="text-muted-foreground">SO / TR number</dt><dd>{si.trNo || "None"}</dd></div>
      </dl>
      {si.statusReason && <p className="text-sm">Reason: {si.statusReason}</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2">Description</th><th>Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead><tbody>{si.items.map((item,index) => <tr key={index} className="border-b"><td className="py-2">{item.description}</td><td className="text-center">{item.quantity}</td><td className="text-right">{money(item.unitPrice)}</td><td className="text-right">{money(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></div>
      <p className="text-right font-semibold">Total: {money(si.items.reduce((sum,item) => sum + item.quantity * item.unitPrice,0))}</p>
      {printable && <div className="overflow-auto rounded-md border bg-slate-200 p-4"><ServiceInvoicePrintDocument si={si} preparedBySignatureUrl={signature?.invoiceNo === si.invoiceNo ? signature.url : ""} /></div>}
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      {(si.scannedFileLink || si.driveFileLink) && <Button variant="outline" asChild><a href={si.scannedFileLink || si.driveFileLink} target="_blank" rel="noopener noreferrer">View stored attachment</a></Button>}
      {printable && <Button onClick={() => void handlePrint()} disabled={printing}>{printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}{printing ? "Preparing…" : "Print invoice"}</Button>}
    </div>
  </DialogContent></Dialog>;
}

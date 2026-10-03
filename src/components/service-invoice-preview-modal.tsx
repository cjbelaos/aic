"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ServiceInvoicePrintDocument from "@/components/service-invoice-print-document";
import { PAYMENT_LABELS } from "@/lib/serviceInvoiceTracking";
import { resolveUserSignatureUrls, signerNameKey } from "@/lib/userSignatures";
import { cn } from "@/lib/utils";
import type { ServiceInvoiceResponse } from "@/types/serviceInvoice";

interface Props {
  si: ServiceInvoiceResponse | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

const money = (value: number) =>
  value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });

const statusStyles: Record<string, string> = {
  created:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  draft:
    "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

const paymentStyles: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  unpaid:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

export function ServiceInvoicePreviewModal({ si, open, onOpenChange }: Props) {
  const [printing, setPrinting] = useState(false);
  const [signature, setSignature] = useState<{
    invoiceNo: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!si) return;
    let active = true;
    resolveUserSignatureUrls([si.preparedBy])
      .then((urls) => {
        if (active)
          setSignature({
            invoiceNo: si.invoiceNo,
            url: urls[signerNameKey(si.preparedBy)] || "",
          });
      })
      .catch(() => {
        if (active) setSignature({ invoiceNo: si.invoiceNo, url: "" });
      });
    return () => {
      active = false;
    };
  }, [si]);

  const total = useMemo(
    () =>
      (si?.items ?? []).reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      ),
    [si],
  );

  if (!si) return null;

  const printable = si.status === "created";
  const paymentKey = si.paymentStatus ?? "unpaid";
  const attachment = si.scannedFileLink || si.driveFileLink;

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
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const width = pdf.internal.pageSize.getWidth();
      const height = Math.min(
        (canvas.height * width) / canvas.width,
        pdf.internal.pageSize.getHeight(),
      );
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

  const detailsView = (
    <div className="space-y-5">
      {/* Customer highlight */}
      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Customer
        </p>
        <p className="mt-1 text-base font-semibold leading-snug break-words">
          {si.companyName}
        </p>
      </div>

      {/* Meta */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Invoice date" value={si.date} />
        <Field
          label="PO number"
          value={si.poNo || <span className="text-muted-foreground">None</span>}
        />
        <Field
          label="SO / TR number"
          value={si.trNo || <span className="text-muted-foreground">None</span>}
        />
      </dl>

      {si.statusReason && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="font-medium">Reason: </span>
          {si.statusReason}
        </div>
      )}

      {/* Items: cards on mobile */}
      <section aria-label="Invoice items" className="space-y-2">
        <h3 className="text-sm font-semibold">Items</h3>

        <ul className="space-y-2 sm:hidden">
          {si.items.map((item, index) => (
            <li key={index} className="rounded-lg border p-3">
              <p className="text-sm font-medium break-words">
                {item.description}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {item.quantity} × {money(item.unitPrice)}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {money(item.quantity * item.unitPrice)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Items: table on sm+ */}
        <div className="hidden overflow-hidden rounded-lg border sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">
                  Description
                </th>
                <th className="w-20 px-4 py-2.5 text-center font-medium">
                  Qty
                </th>
                <th className="w-36 px-4 py-2.5 text-right font-medium">
                  Unit price
                </th>
                <th className="w-36 px-4 py-2.5 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {si.items.map((item, index) => (
                <tr key={index}>
                  <td className="px-4 py-3 break-words">{item.description}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(item.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {money(item.quantity * item.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3 sm:ml-auto sm:w-72">
          <span className="text-sm font-medium text-muted-foreground">
            Total
          </span>
          <span className="text-lg font-bold tabular-nums">{money(total)}</span>
        </div>
      </section>
    </div>
  );

  const printDocument = (
    <div className="overflow-auto rounded-md border bg-slate-200 p-2 sm:p-4">
      <ServiceInvoicePrintDocument
        si={si}
        preparedBySignatureUrl={
          signature?.invoiceNo === si.invoiceNo ? signature.url : ""
        }
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0",
          // Mobile: near full-screen sheet. Desktop: centered, readable width.
          "h-[92dvh] max-h-[92dvh] w-[100vw] max-w-none rounded-b-none sm:w-[95vw] sm:max-w-4xl sm:rounded-lg",
        )}
      >
        {/* Header */}
        <DialogHeader className="space-y-2 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg sm:text-xl">
            Service Invoice #{si.invoiceNo}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Details and print preview for service invoice {si.invoiceNo}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("capitalize", statusStyles[si.status] ?? "")}
            >
              {si.status}
            </Badge>
            <Badge
              variant="outline"
              className={paymentStyles[paymentKey] ?? ""}
            >
              {PAYMENT_LABELS[paymentKey]}
            </Badge>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {printable ? (
            <Tabs defaultValue="details" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="print">Print preview</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-0">
                {detailsView}
              </TabsContent>
              {/* forceMount keeps #si-html-content in the DOM so Print always works */}
              <TabsContent
                value="print"
                forceMount
                className="mt-0 data-[state=inactive]:hidden"
              >
                {printDocument}
              </TabsContent>
            </Tabs>
          ) : (
            detailsView
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
          {attachment && (
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <a href={attachment} target="_blank" rel="noopener noreferrer">
                <Paperclip className="mr-2 h-4 w-4" />
                View attachment
              </a>
            </Button>
          )}
          {printable && (
            <Button
              onClick={() => void handlePrint()}
              disabled={printing}
              className="w-full sm:w-auto"
            >
              {printing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {printing ? "Preparing…" : "Print invoice"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

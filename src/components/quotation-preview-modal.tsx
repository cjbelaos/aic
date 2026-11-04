"use client";

import { isDraftQuotationReference, quotationNumberLabel } from "@/lib/quotationReference";
import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Printer, Download, Save, ExternalLink, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Quotation } from "@/types/quotation";
import quotationService from "@/lib/services/quotation.service";
import { QuotationSendReview } from "./quotation-send-review";
import { resolveUserSignatureUrls, type UserSignatureUrls } from "@/lib/userSignatures";
import { BusinessDocumentPrintFrame, type BusinessDocumentPrintHandle } from "./business-document-print-frame";
import { QuotationPrintDocument } from "./quotation-print-document";
import { quotationRevisionLabel, quotationSnapshotToken } from "@/lib/quotationRevision";
import { quotationTermsError } from "@/lib/quotationTerms";

export function QuotationPreviewModal({ quotation, onClose, onSaved }: { quotation: Quotation; customerEmail?: string; onClose: () => void; onSaved: () => void }) {
  const [review, setReview] = useState(false);
  const printFrame = useRef<BusinessDocumentPrintHandle>(null);
  const [previous, setPrevious] = useState(false);
  const [busy, setBusy] = useState<"print" | "download" | "drive" | "send" | null>(null);
  const [fileLink, setFileLink] = useState(quotation.file);
  const [currentQuotation, setCurrentQuotation] = useState(quotation);
  const [signatureUrls, setSignatureUrls] = useState<UserSignatureUrls>({});
  const [signaturesLoading, setSignaturesLoading] = useState(true);
  useEffect(() => {
    let active = true;
    resolveUserSignatureUrls([quotation.preparedBy, quotation.approvedBy])
      .then(urls => { if (active) setSignatureUrls(urls); })
      .catch(() => { if (active) setSignatureUrls({}); })
      .finally(() => { if (active) setSignaturesLoading(false); });
    return () => { active = false; };
  }, [quotation]);

  const run = async (action: "print" | "download" | "drive" | "send") => {
    setBusy(action);
    try {
      if (action === "send") {
        const recovered = await quotationService.recoverPendingSend(quotation.quotationNo);
        if (recovered) {
          const confirmed = await quotationService.getByRefNo(quotation.quotationNo);
          if (confirmed) { setCurrentQuotation(confirmed); setFileLink(confirmed.file); }
          onSaved(); toast.success(recovered.message); return;
        }
      }
      const requiredError = quotationTermsError(currentQuotation);
      if (requiredError) throw new Error(requiredError);
      if (action === "print") {
        if (!printFrame.current) throw new Error("The preview is still loading.");
        await printFrame.current.print();
        return;
      }
      const latest = await quotationService.getByRefNo(quotation.quotationNo);
      if (!latest) throw new Error("Unable to load the latest saved quotation. Please try again.");
      if (quotationSnapshotToken(latest) !== quotationSnapshotToken(currentQuotation)) throw new Error("This quotation changed after the preview opened. Close and reopen it to review the latest version.");
      if (action === "send") { setReview(true); return; }
      const { generateQuotationPdfBase64 } = await import("@/lib/quotationPdf");
      const pdfBase64 = await generateQuotationPdfBase64(latest);

      if (action === "drive") {
        const result = await quotationService.savePdfToDrive(latest.quotationNo, pdfBase64, quotationSnapshotToken(latest));
        setFileLink(result.fileLink);
        onSaved();
        toast.success("Quotation PDF saved to Google Drive.");
      } else {
        const blob = new Blob([Uint8Array.from(atob(pdfBase64), character => character.charCodeAt(0))], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Quotation_${isDraftQuotationReference(latest.quotationNo) ? "draft" : latest.quotationNo.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      toast.error((isAxiosError(error) ? error.response?.data?.error || error.response?.data?.message : undefined) || (error instanceof Error ? error.message : "Unable to prepare quotation PDF."));
    } finally { setBusy(null); }
  };
  const disabled = !!busy || signaturesLoading || previous || !!quotationTermsError(currentQuotation);
  const termsError = quotationTermsError(currentQuotation);
  const previousId = fileLink.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || fileLink.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  return <>{review && <QuotationSendReview quotation={currentQuotation} onClose={() => setReview(false)} onSent={() => { setReview(false); onSaved(); onClose(); }} />}<Dialog open={!review} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="w-[95vw] sm:max-w-none h-[92dvh] max-h-[92dvh] p-3 sm:p-6 flex flex-col">
      <DialogHeader><DialogTitle className="flex flex-wrap justify-between gap-2 pr-6"><span>Quotation — {quotationRevisionLabel(currentQuotation)}</span><span className="text-sm text-muted-foreground">{quotation.customer}</span></DialogTitle></DialogHeader>
      <div className="rounded-md border bg-muted/30 p-3 text-sm flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Quotation details</p><p className="text-xs text-muted-foreground">The A4 preview uses saved quotation data. View the previous PDF for original details that older records may not retain.</p></div><Button variant="outline" size="sm" disabled={!fileLink || !!busy} onClick={() => setPrevious(!previous)}>{previous ? "Use new A4 format" : "View previous format"}</Button></div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {fileLink && <Button variant="outline" size="sm" onClick={() => window.open(fileLink, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-1.5 h-4 w-4" />Open in Drive</Button>}
        <Button size="sm" disabled={disabled || !!termsError} onClick={() => void run("send")}>{busy === "send" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}{currentQuotation.revisionPending ? "Send revised quotation" : currentQuotation.status === "SENT" ? "Resend quotation" : "Send to Client"}</Button>
        <Button size="sm" disabled={disabled} onClick={() => void run("print")}>{busy === "print" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}Print</Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => void run("download")}>{busy === "download" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}Download PDF</Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => void run("drive")}>{busy === "drive" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{fileLink ? "Update Drive PDF" : "Save to Drive"}</Button>
      </div>
      {termsError && <p role="alert" className="text-sm text-destructive">{termsError} Edit the quotation to complete its terms before sending.</p>}
      <div className="flex-1 min-h-48 border rounded-md overflow-hidden bg-muted/20">
        {termsError ? <p className="p-4 text-sm">Complete the required terms before previewing this quotation.</p> : previous ? <iframe className="w-full h-full border-none" title="Previous quotation PDF" src={previousId ? `https://drive.google.com/file/d/${previousId}/preview` : fileLink} /> : <BusinessDocumentPrintFrame ref={printFrame} title={`Quotation ${quotationNumberLabel(currentQuotation.quotationNo)}`}><QuotationPrintDocument quotation={currentQuotation} signatureUrls={signatureUrls} /></BusinessDocumentPrintFrame>}
      </div>
    </DialogContent>
  </Dialog></>;
}

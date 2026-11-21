"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BusinessDocumentPrintFrame, type BusinessDocumentPrintHandle } from "./business-document-print-frame";
import { PurchaseRequestPrintDocument } from "./purchase-request-print-document";
import type { PrView } from "@/components/purchase-requests/api";
import { resolveUserSignatureUrls, type UserSignatureUrls } from "@/lib/userSignatures";

/** On-screen A4 preview with browser print (no Drive copy). */
export function PurchaseRequestPreviewModal({ pr, onClose }: { pr: PrView; onClose: () => void }) {
  const printFrame = useRef<BusinessDocumentPrintHandle>(null);
  const [printing, setPrinting] = useState(false);
  const [signatureUrls, setSignatureUrls] = useState<UserSignatureUrls>({});
  useEffect(() => {
    resolveUserSignatureUrls([pr.requestedByName]).then(setSignatureUrls).catch(() => setSignatureUrls({}));
  }, [pr]);

  const print = async () => {
    setPrinting(true);
    try { await printFrame.current?.print(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Unable to print purchase request."); }
    finally { setPrinting(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[95vw] flex-col overflow-y-auto p-4 sm:max-w-none sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1 pr-6 text-left sm:flex-row sm:items-center sm:justify-between">
            <span className="text-lg font-bold">Purchase Request — {pr.prNo || "Draft"}</span>
            <span className="text-sm font-medium text-muted-foreground">{pr.salesOrderNoSnapshot} · {pr.customerNameSnapshot}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="my-2 min-h-0 w-full flex-1 overflow-auto rounded-md border bg-muted/20 p-4">
          <BusinessDocumentPrintFrame ref={printFrame} title={`Purchase Request ${pr.prNo}`}><PurchaseRequestPrintDocument pr={pr} signatureUrls={signatureUrls} /></BusinessDocumentPrintFrame>
        </div>
        <div className="flex justify-end border-t pt-3">
          <Button size="sm" onClick={() => void print()} disabled={printing}>
            {printing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
            {printing ? "Preparing..." : "Print"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

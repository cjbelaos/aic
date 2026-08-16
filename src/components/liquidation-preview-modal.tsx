"use client";

import { Loader2, Download, ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import LiquidationPrintDocument from "@/components/liquidation-print-document";
import type { ReceiptItemInput } from "@/types/liquidation";

interface LiquidationPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controlNo: string;
  fullName: string;
  items: ReceiptItemInput[];
  categories: string[];
  advances: number;
  onDownloadPdf?: () => void;
  downloadingPdf?: boolean;
  onDownloadImage?: () => void;
  downloadingImage?: boolean;
}

export default function LiquidationPreviewModal({
  open,
  onOpenChange,
  controlNo,
  fullName,
  items,
  categories,
  advances,
  onDownloadPdf,
  downloadingPdf = false,
  onDownloadImage,
  downloadingImage = false,
}: LiquidationPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle>Preview Expense Liquidation</DialogTitle>
        </DialogHeader>

        {/* ── Scrollable Document Container ── */}
        <div className="flex-1 overflow-auto py-2">
          <LiquidationPrintDocument
            controlNo={controlNo}
            fullName={fullName}
            items={items}
            categories={categories}
            advances={advances}
            id="liquidation-preview-content"
          />
        </div>

        {/* ── Actions ── */}
        {(onDownloadPdf || onDownloadImage) && (
          <DialogFooter className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t">
            {onDownloadPdf && (
              <Button
                variant="outline"
                onClick={onDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download PDF
              </Button>
            )}
            {onDownloadImage && (
              <Button
                variant="outline"
                onClick={onDownloadImage}
                disabled={downloadingImage}
              >
                {downloadingImage ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                Download as Image
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
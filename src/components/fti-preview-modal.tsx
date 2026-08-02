"use client";

import { useRef } from "react";
import { Loader2, Download, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import FTIPrintDocument from "@/components/fti-print-document";

// Re-export shared types so existing imports keep working.
export type {
  ExpresswaySegment,
  DestinationPreview,
  DraftItinerary,
} from "@/components/fti-print-document";

interface FTIPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchItems: import("@/components/fti-print-document").DraftItinerary[];
  ftiRef: string;
  technician: string;
  fullName: string;
  kmPerLiter?: number;
  onDownloadPdf?: () => void;
  downloadingPdf?: boolean;
  onSaveData?: () => void;
  savingData?: boolean;
  readOnly?: boolean;
}

export default function FTIPreviewModal({
  open,
  onOpenChange,
  batchItems,
  ftiRef,
  technician,
  fullName,
  kmPerLiter = 12,
  onDownloadPdf,
  downloadingPdf = false,
  onSaveData,
  savingData = false,
  readOnly = false,
}: FTIPreviewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle>
            {readOnly ? "FTI Request Details" : "Preview FTI Request"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Scrollable Document Container ── */}
        <div className="flex-1 overflow-auto py-2">
          <FTIPrintDocument
            batchItems={batchItems}
            ftiRef={ftiRef}
            technician={technician}
            fullName={fullName}
            kmPerLiter={kmPerLiter}
            id="fti-preview-content"
          />
        </div>

        {/* ── Actions ── */}
        <DialogFooter className="flex flex-wrap gap-2 pt-3 border-t">
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
          {!readOnly && onSaveData && (
            <Button onClick={onSaveData} disabled={savingData}>
              {savingData ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Data
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

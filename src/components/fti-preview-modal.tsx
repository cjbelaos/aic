"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Download,
  Save,
  CheckCircle2,
  MessageSquareWarning,
  XCircle,
  ReceiptText,
  ImageIcon,
  Share2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  onDownloadImage?: () => void;
  downloadingImage?: boolean;
  onShareImage?: () => void;
  sharingImage?: boolean;
  onSaveData?: () => void;
  savingData?: boolean;
  readOnly?: boolean;
  // ── Approval actions ──
  approvalActions?: {
    onApprove: (comment: string) => void;
    onRequestChange: (comment: string) => void;
    onReject: (comment: string) => void;
    actionInProgress?: boolean;
  };
  approvalComment?: string;
  approvalStatus?: string;
  // ── Approval display on the printed document ──
  approvedBy?: string;
  approvedBySignatureUrl?: string;
  // ── PDF regeneration (for approved records missing signature) ──
  onRegeneratePdf?: () => void;
  regeneratingPdf?: boolean;
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
  onDownloadImage,
  downloadingImage = false,
  onShareImage,
  sharingImage = false,
  onSaveData,
  savingData = false,
  readOnly = false,
  approvalActions,
  approvalComment,
  approvalStatus,
  approvedBy,
  approvedBySignatureUrl,
  onRegeneratePdf,
  regeneratingPdf = false,
}: FTIPreviewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [comment, setComment] = useState("");

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
            approvedBy={approvedBy}
            approvedBySignatureUrl={approvedBySignatureUrl}
          />
        </div>

        {/* ── Actions ── */}
        {/* ── Actions Footer ── */}
        {(onDownloadPdf ||
          onDownloadImage ||
          onShareImage ||
          (!readOnly && onSaveData) ||
          approvalActions ||
          readOnly) && (
          <div className="flex flex-col gap-3 pt-3 border-t shrink-0">
            {/* 1. Approval Action & Comment Box */}
            {approvalActions && (
              <div className="w-full bg-slate-900/50 p-3 rounded-lg border border-slate-800 space-y-2">
                <Label
                  htmlFor="fti-approval-comment"
                  className="text-xs font-medium text-slate-300"
                >
                  Comment{" "}
                  <span className="text-slate-400 font-normal">
                    (required for Request for Change)
                  </span>
                </Label>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
                  <Input
                    id="fti-approval-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Type your comments for the requester..."
                    disabled={approvalActions?.actionInProgress}
                    className="h-9 text-sm flex-1 bg-slate-950"
                  />
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-9"
                      onClick={() => approvalActions?.onApprove(comment)}
                      disabled={approvalActions?.actionInProgress}
                    >
                      {approvalActions?.actionInProgress ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-500 border-amber-600/40 hover:bg-amber-950/30 h-9"
                      onClick={() => approvalActions?.onRequestChange(comment)}
                      disabled={approvalActions?.actionInProgress}
                    >
                      {approvalActions?.actionInProgress ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                      )}
                      Request for Change
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-9"
                      onClick={() => approvalActions?.onReject(comment)}
                      disabled={approvalActions?.actionInProgress}
                    >
                      {approvalActions?.actionInProgress ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-1.5 h-4 w-4" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Primary Navigation & Export Actions */}
            <div className="flex items-center justify-between gap-2 w-full">
              <div>
                {readOnly && (
                  <Link
                    href={`/dashboard/expense-liquidation?controlNo=${encodeURIComponent(
                      ftiRef,
                    )}`}
                  >
                    <Button variant="outline" size="sm" className="h-9">
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Add Expense Liquidation
                    </Button>
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onDownloadPdf && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={onDownloadPdf}
                    disabled={downloadingPdf}
                  >
                    {downloadingPdf ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                )}
                {onDownloadImage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={onDownloadImage}
                    disabled={downloadingImage}
                  >
                    {downloadingImage ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="mr-1.5 h-4 w-4" />
                    )}
                    Download as Image
                  </Button>
                )}
                {onShareImage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={onShareImage}
                    disabled={sharingImage}
                  >
                    {sharingImage ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Share2 className="mr-1.5 h-4 w-4" />
                    )}
                    Share to Messenger
                  </Button>
                )}
                {onRegeneratePdf && readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={onRegeneratePdf}
                    disabled={regeneratingPdf}
                  >
                    {regeneratingPdf ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-4 w-4" />
                    )}
                    Regenerate PDF
                  </Button>
                )}
                {!readOnly && onSaveData && (
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={onSaveData}
                    disabled={savingData}
                  >
                    {savingData ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Save Data
                  </Button>
                )}
              </div>
            </div>

            {/* 3. Status Display Footer */}
            {approvalStatus && (
              <div className="text-xs text-slate-400 pt-1 flex items-center justify-between border-t border-slate-800">
                <div>
                  Status:{" "}
                  <span className="font-semibold text-slate-200">
                    {approvalStatus}
                  </span>
                  {approvalComment && (
                    <span className="ml-2">
                      | Approver Comment:{" "}
                      <em className="text-slate-300">{approvalComment}</em>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

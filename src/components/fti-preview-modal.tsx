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
        {(onDownloadPdf ||
          onDownloadImage ||
          onShareImage ||
          (!readOnly && onSaveData) ||
          approvalActions ||
          readOnly) && (
          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t">
            {/* Left aligned items */}
            {readOnly && (
              <div className="sm:mr-auto">
                <Link
                  href={`/dashboard/expense-liquidation?controlNo=${encodeURIComponent(
                    ftiRef,
                  )}`}
                >
                  <Button variant="outline">
                    <ReceiptText className="mr-2 h-4 w-4" />
                    Add Expense Liquidation
                  </Button>
                </Link>
              </div>
            )}

            {/* Right aligned action buttons */}
            <div className="flex flex-wrap items-center gap-2">
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
              {onShareImage && (
                <Button
                  variant="outline"
                  onClick={onShareImage}
                  disabled={sharingImage}
                >
                  {sharingImage ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="mr-2 h-4 w-4" />
                  )}
                  Share to Messenger
                </Button>
              )}
              {onRegeneratePdf && readOnly && (
                <Button
                  variant="outline"
                  onClick={onRegeneratePdf}
                  disabled={regeneratingPdf}
                >
                  {regeneratingPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Regenerate PDF
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
            </div>

            {/* ── Approval action area ── */}
            {approvalActions && (
              <div className="w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-1.5">
                    <Label htmlFor="fti-approval-comment">
                      Comment{" "}
                      <span className="text-xs text-muted-foreground">
                        (required for Request for Change)
                      </span>
                    </Label>
                    <Input
                      id="fti-approval-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Type your comments for the requester..."
                      disabled={approvalActions?.actionInProgress}
                    />
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2 pt-5">
                    <Button
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approvalActions?.onApprove(comment)}
                      disabled={approvalActions?.actionInProgress}
                    >
                      {approvalActions?.actionInProgress ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() => approvalActions?.onRequestChange(comment)}
                      disabled={approvalActions?.actionInProgress}
                    >
                      {approvalActions?.actionInProgress ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquareWarning className="mr-2 h-4 w-4" />
                      )}
                      Request for Change
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => approvalActions?.onReject(comment)}
                      disabled={approvalActions?.actionInProgress}
                    >
                      {approvalActions?.actionInProgress ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogFooter>
        )}

        {/* ── Approval info (shown to requester / read-only viewers) ── */}
        {approvalStatus && (
          <div className="pt-2 border-t text-sm text-muted-foreground">
            Status:{" "}
            <span className="font-semibold text-foreground">
              {approvalStatus}
            </span>
            {approvalComment && (
              <span className="block mt-1">
                Approver comment: <em>{approvalComment}</em>
              </span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

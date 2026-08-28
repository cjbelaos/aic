"use client";

import { useState } from "react";
import {
  Loader2,
  Download,
  ImageIcon,
  CheckCircle2,
  MessageSquareWarning,
  XCircle,
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
import LiquidationPrintDocument from "@/components/liquidation-print-document";
import type { ReceiptItemInput } from "@/types/liquidation";

interface LiquidationPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controlNo: string;
  fullName: string;
  items: ReceiptItemInput[];
  categories: string[];
  miscLookup?: Map<string, string>;
  advances: number;
  onDownloadPdf?: () => void;
  downloadingPdf?: boolean;
  onDownloadImage?: () => void;
  downloadingImage?: boolean;
  readOnly?: boolean;
  // ── Approval actions (mirrors the FTI preview modal) ──
  approvalActions?: {
    onApprove: (comment: string) => void;
    onRequestChange: (comment: string) => void;
    onReject: (comment: string) => void;
    actionInProgress?: boolean;
  };
  approvalComment?: string;
  approvalStatus?: string;
  // ── Approval display on the printed document (mirrors FTIPreviewModal) ──
  approvedBy?: string;
  approvedBySignatureUrl?: string;
}

export default function LiquidationPreviewModal({
  open,
  onOpenChange,
  controlNo,
  fullName,
  items,
  categories,
  miscLookup,
  advances,
  onDownloadPdf,
  downloadingPdf = false,
  onDownloadImage,
  downloadingImage = false,
  readOnly = false,
  approvalActions,
  approvalComment,
  approvalStatus,
  approvedBy,
  approvedBySignatureUrl,
}: LiquidationPreviewModalProps) {
  const [comment, setComment] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle>
            {readOnly ? "Liquidation Details" : "Preview Expense Liquidation"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Scrollable Document Container ── */}
        <div className="flex-1 overflow-auto py-2">
          <LiquidationPrintDocument
            controlNo={controlNo}
            fullName={fullName}
            items={items}
            categories={categories}
            miscLookup={miscLookup}
            advances={advances}
            id="liquidation-preview-content"
            approvedBy={approvedBy}
            approvedBySignatureUrl={approvedBySignatureUrl}
          />
        </div>

        {/* ── Actions ── */}
        {(onDownloadPdf || onDownloadImage || approvalActions || readOnly) && (
          <DialogFooter className="flex flex-col items-stretch gap-3 pt-3 border-t">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
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
            </div>

            {/* ── Approval action area ── */}
            {approvalActions && (
              <div className="w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-1.5">
                    <Label htmlFor="liquidation-approval-comment">
                      Comment{" "}
                      <span className="text-xs text-muted-foreground">
                        (required for Request for Change)
                      </span>
                    </Label>
                    <Input
                      id="liquidation-approval-comment"
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
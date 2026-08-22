"use client";

import { useEffect, useCallback, useState } from "react";
import { X, FileText, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiptPreviewDialogProps {
  /** The direct Google Drive URL (webViewLink). */
  receiptImageUrl: string;
  /** Optional proxy/preview URL for thumbnail. */
  receiptPreviewUrl?: string;
  /** Whether the receipt is an image (vs PDF). */
  isImage?: boolean;
  /** Controls dialog visibility. */
  open: boolean;
  /** Called when the dialog should close. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen centered receipt image preview with dark overlay.
 * Supports both images and PDFs. Closes on Escape / click-outside / X button.
 *
 * Tries the proxy URL first, then falls back to the direct Google Drive URL.
 */
export default function ReceiptPreviewDialog({
  receiptImageUrl,
  receiptPreviewUrl,
  isImage = true,
  open,
  onOpenChange,
}: ReceiptPreviewDialogProps) {
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Track which URL we're currently trying
  const [useFallback, setUseFallback] = useState(false);

  // Try proxy first, then fall back to direct Drive URL
  const displayUrl = useFallback ? receiptImageUrl : (receiptPreviewUrl || receiptImageUrl);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  // Reset state when a new image is opened
  useEffect(() => {
    if (open) {
      setImageStatus("loading");
      setUseFallback(false);
    }
  }, [open, receiptImageUrl, receiptPreviewUrl]);

  const handleImageError = () => {
    if (!useFallback && receiptPreviewUrl) {
      // Proxy failed — try the direct Drive URL
      setUseFallback(true);
      setImageStatus("loading");
    } else {
      // Both URLs failed
      setImageStatus("error");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative max-h-[90vh] max-w-[90vw] rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* ── Close button ── */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ── Image content ── */}
        {isImage ? (
          <div className="relative flex items-center justify-center min-h-[200px] min-w-[300px]">
            {imageStatus === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {imageStatus === "error" ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Failed to load receipt image.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(receiptImageUrl, "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Google Drive
                </Button>
              </div>
            ) : (
              <img
                key={displayUrl}
                src={displayUrl}
                alt="Receipt"
                className="max-h-[85vh] max-w-[85vw] object-contain"
                onLoad={() => setImageStatus("loaded")}
                onError={handleImageError}
              />
            )}
          </div>
        ) : (
          /* ── PDF fallback ── */
          <div className="flex flex-col items-center gap-4 p-10 text-center">
            <FileText className="h-16 w-16 text-muted-foreground" />
            <p className="text-sm font-medium">PDF Receipt</p>
            <p className="text-xs text-muted-foreground">
              This receipt is a PDF file. Open it in a new tab to view.
            </p>
            <Button
              variant="default"
              onClick={() => window.open(receiptImageUrl, "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open PDF
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
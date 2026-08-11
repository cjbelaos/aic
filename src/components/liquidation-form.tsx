"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Upload,
  X,
  Send,
  ReceiptText,
  FileText,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { RECEIPT_CATEGORIES } from "@/types/liquidation";
import type { ReceiptItemInput } from "@/types/liquidation";
import { liquidationService } from "@/lib/services/liquidation.service";

interface StoredUser {
  userId?: string;
  fullName?: string;
  userName?: string;
}

export function LiquidationForm({ user }: { user: StoredUser | null }) {
  const [items, setItems] = useState<ReceiptItemInput[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Line-item input draft
  const [draftDate, setDraftDate] = useState<Date | undefined>(undefined);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftReceiptUrl, setDraftReceiptUrl] = useState("");
  const [draftReceiptPreviewUrl, setDraftReceiptPreviewUrl] = useState("");
  const [draftReceiptFile, setDraftReceiptFile] = useState<File | null>(null);
  const [draftPreviewSrc, setDraftPreviewSrc] = useState("");
  const [draftReceiptIsImage, setDraftReceiptIsImage] = useState(true);
  const [draftReceiptName, setDraftReceiptName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successLiquidationId, setSuccessLiquidationId] = useState<
    string | null
  >(null);
  const [submittedTotal, setSubmittedTotal] = useState(0);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const displayName =
    user?.fullName || user?.userName || user?.userId || "User";
  const displayUserId = user?.userId || user?.userName || "—";

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

  const isImageUrl = (url: string) =>
    /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(url) &&
    !url.includes("drive.google.com");

  const resetDraft = () => {
    setEditingIndex(null);
    setDraftDate(undefined);
    setDraftDescription("");
    setDraftCategory("");
    setDraftAmount("");
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(null);
    setDraftPreviewSrc("");
    setDraftReceiptUrl("");
    setDraftReceiptPreviewUrl("");
    setDraftReceiptIsImage(true);
    setDraftReceiptName("");
  };

  // ── Receipt photo: store locally first (no Drive upload yet) ──
  // The photo is kept as a browser File + object-URL preview so the user can
  // retake/remove it freely. It is only uploaded to Google Drive when the
  // item is added/updated via handleAddOrUpdateItem.
  const handleFileSelected = (file?: File) => {
    if (!file) return;
    // Release the previous local preview if one existed.
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(file);
    setDraftPreviewSrc(URL.createObjectURL(file));
    setDraftReceiptIsImage(file.type.startsWith("image/"));
    setDraftReceiptName(file.name);
    setDraftReceiptUrl("");
    setDraftReceiptPreviewUrl("");
    // Reset input values so selecting the same file again re-triggers change
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
    const active = document.activeElement as HTMLInputElement | null;
    if (active && active.type === "file") active.value = "";
  };

  const handleRemoveReceipt = () => {
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(null);
    setDraftPreviewSrc("");
    setDraftReceiptUrl("");
    setDraftReceiptPreviewUrl("");
    setDraftReceiptIsImage(true);
    setDraftReceiptName("");
  };

  // ── Line-item add / update (uploads photo to Drive only at this point) ──
  const handleAddOrUpdateItem = async () => {
    if (!draftDate) {
      toast.error("Please select a date.");
      return;
    }
    if (!draftDescription.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    if (!draftCategory) {
      toast.error("Please select a category.");
      return;
    }
    const amount = parseFloat(draftAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    const dateStr = `${draftDate.getFullYear()}-${String(
      draftDate.getMonth() + 1,
    ).padStart(2, "0")}-${String(draftDate.getDate()).padStart(2, "0")}`;

    let finalReceiptUrl = draftReceiptUrl;
    let finalReceiptPreviewUrl = draftReceiptPreviewUrl;
    let finalReceiptIsImage = draftReceiptIsImage;

    // Upload the NEW locally-held photo to Drive when the item is committed.
    if (draftReceiptFile && !draftReceiptUrl) {
      setUploading(true);
      try {
        const result = await liquidationService.uploadReceipt(draftReceiptFile);
        finalReceiptUrl = result.receiptImageUrl;
        finalReceiptPreviewUrl = result.proxyUrl;
        finalReceiptIsImage = draftReceiptIsImage;
        toast.success("Receipt photo saved to Drive.");
      } catch (error) {
        console.error("Receipt upload failed:", error);
        const message =
          error instanceof Error ? error.message : "Unknown upload error.";
        toast.error(`Upload failed: ${message}`);
        return; // Keep the draft so the user can retry.
      } finally {
        setUploading(false);
      }
    }

    const item: ReceiptItemInput = {
      date: dateStr,
      description: draftDescription.trim().toUpperCase(),
      category: draftCategory,
      amount: Math.round(amount * 100) / 100,
      receiptImageUrl: finalReceiptUrl || undefined,
      receiptPreviewUrl: finalReceiptPreviewUrl || undefined,
      receiptIsImage: finalReceiptUrl ? finalReceiptIsImage : undefined,
    };

    if (editingIndex !== null) {
      setItems((prev) =>
        prev.map((existing, idx) => (idx === editingIndex ? item : existing)),
      );
      toast.success("Receipt item updated.");
    } else {
      setItems((prev) => [...prev, item]);
      toast.success("Receipt item added.");
    }

    resetDraft();
  };

  const handleEditItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    // Clear any locally-held photo from a previous unattached draft so the
    // editor starts fresh from the item's existing Drive receipt.
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(null);
    setDraftPreviewSrc("");
    setEditingIndex(index);
    const [y, m, d] = item.date.split("-").map(Number);
    setDraftDate(new Date(y, (m || 1) - 1, d || 1));
    setDraftDescription(item.description);
    setDraftCategory(item.category);
    setDraftAmount(String(item.amount));
    setDraftReceiptUrl(item.receiptImageUrl || "");
    setDraftReceiptPreviewUrl(item.receiptPreviewUrl || "");
    setDraftReceiptIsImage(
      item.receiptIsImage ?? (item.receiptImageUrl ? isImageUrl(item.receiptImageUrl) : true),
    );
    setDraftReceiptName(
      item.receiptImageUrl ? "Receipt attached" : "",
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    if (editingIndex === index) {
      resetDraft();
    }
    toast.success("Receipt item removed.");
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error("Add at least one receipt item before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await liquidationService.create(items);
      setSubmittedTotal(result.totalAmount);
      setSuccessLiquidationId(result.liquidationId);
      toast.success(`Liquidation submitted! ID: ${result.liquidationId}`);
      // Clear the form for the next batch
      setItems([]);
      resetDraft();
    } catch (error) {
      console.error("Liquidation submit failed:", error);
      toast.error("Failed to submit liquidation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNew = () => {
    setSuccessLiquidationId(null);
    setSubmittedTotal(0);
  };

  // ── Success feedback screen ──
  if (successLiquidationId) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-4 px-5 py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <CardTitle className="text-2xl">Liquidation Submitted!</CardTitle>
          <p className="text-muted-foreground">
            Your expense liquidation was recorded successfully.
          </p>
          <div className="w-full rounded-lg border bg-muted px-4 py-3 font-mono text-xs break-all sm:text-sm">
            Liquidation ID: {successLiquidationId}
          </div>
          <p className="text-muted-foreground">
            Total Amount:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(submittedTotal)}
            </span>
          </p>
          <Button
            size="lg"
            className="mt-2 h-12 w-full sm:w-auto"
            onClick={handleStartNew}
          >
            <Plus className="mr-2 h-5 w-5" />
            New Liquidation
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {/* ── Header & context ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ReceiptText className="h-5 w-5" />
            Expense Liquidation
          </CardTitle>
          <CardDescription>
            Submit your reimbursable expenses and attach receipt photos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">Technician</Label>
            <p className="truncate font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              ID: {displayUserId}
            </p>
          </div>
          <div className="shrink-0 rounded-lg border bg-muted px-4 py-2 text-right">
            <Label className="text-[10px] text-muted-foreground">Total</Label>
            <p className="text-lg font-bold tracking-tight">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Line item entry ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {editingIndex !== null ? "Edit Receipt Item" : "Add Receipt Item"}
          </CardTitle>
          <CardDescription>
            Fill in the details, then take or upload the receipt photo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <DatePicker value={draftDate} onChange={setDraftDate} />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={draftCategory} onValueChange={setDraftCategory}>
              <SelectTrigger className="h-11 text-base">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {RECEIPT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              className="h-11 text-base"
              placeholder="e.g. Lunch during field service"
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Amount (₱)</Label>
            <Input
              className="h-11 text-lg"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value)}
            />
          </div>

          {/* ── Receipt photo capture / upload (mobile-first) ── */}
          <div className="space-y-2">
            <Label>Receipt Photo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="lg"
                className="h-12 flex-1 text-base"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="mr-2 h-5 w-5" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 flex-1 text-base"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-5 w-5" />
                Upload
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading receipt...
              </div>
            )}

            {(draftReceiptFile || draftReceiptUrl) && (
              <div className="space-y-2">
                {draftReceiptIsImage ? (
                  <div className="overflow-hidden rounded-xl border bg-muted">
                    <img
                      src={
                        draftPreviewSrc ||
                        draftReceiptPreviewUrl ||
                        draftReceiptUrl
                      }
                      alt="Receipt preview"
                      className="max-h-64 w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border bg-muted p-4">
                    <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {draftReceiptName || "PDF receipt"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF file attached
                      </p>
                    </div>
                  </div>
                )}
                {draftReceiptFile && !draftReceiptUrl && (
                  <p className="text-xs font-medium text-amber-600">
                    Saved locally — will upload to Drive when you add this item.
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                    {draftReceiptName || "Receipt file"}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera className="mr-1 h-4 w-4" />
                      Retake
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 text-destructive"
                      onClick={handleRemoveReceipt}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            onClick={handleAddOrUpdateItem}
            disabled={uploading}
          >
            {editingIndex !== null ? (
              <>
                <Pencil className="mr-2 h-5 w-5" />
                Update Item
              </>
            ) : (
              <>
                <Plus className="mr-2 h-5 w-5" />
                Add Item
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Itemized summary (mobile-first card list) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Receipt Items</CardTitle>
          <CardDescription>
            {items.length === 0
              ? "No items added yet."
              : `${items.length} item(s) — Total: ${formatCurrency(totalAmount)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Add receipt items above to build your liquidation batch.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const isImage =
                  item.receiptIsImage ??
                  (item.receiptImageUrl
                    ? isImageUrl(item.receiptImageUrl)
                    : true);
                return (
                  <div
                    key={`${item.date}-${index}`}
                    className="rounded-xl border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium whitespace-nowrap">
                            {item.date}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {item.category}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {item.description}
                        </p>
                        <p className="mt-1 text-lg font-bold">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {item.receiptImageUrl ? (
                          <a
                            href={item.receiptImageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open receipt"
                          >
                            {isImage ? (
                              <img
                                src={
                                  item.receiptPreviewUrl || item.receiptImageUrl
                                }
                                alt="Receipt"
                                className="h-14 w-14 rounded-lg border object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted">
                                <FileText className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No receipt
                          </span>
                        )}
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            aria-label="Edit item"
                            onClick={() => handleEditItem(index)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-destructive"
                            aria-label="Delete item"
                            onClick={() => handleDeleteItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Sticky bottom submit bar (always reachable on mobile) ── */}
      <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-3 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0">
            <p className="text-[10px] text-muted-foreground">Total Amount</p>
            <p className="text-lg font-bold leading-tight">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 flex-1 max-w-xs text-base"
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Submit Liquidation
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

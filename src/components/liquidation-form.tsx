"use client";

import { useEffect, useRef, useState } from "react";
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
  Lock,
  Eye,
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/ui/date-picker";
import type {
  LiquidationFull,
  LiquidationStatus,
  ReceiptItemInput,
} from "@/types/liquidation";
import { liquidationService } from "@/lib/services/liquidation.service";
import { ftiService } from "@/lib/services/fti.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { userService } from "@/lib/services/user.service";
import type { FTIRequestSummary } from "@/types/fti";
import LiquidationPreviewModal from "@/components/liquidation-preview-modal";
import LiquidationPrintDocument from "@/components/liquidation-print-document";

/** Maps FTI request statuses to badge tailwind classes (matches FTI page). */
function statusBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REQUESTED_FOR_CHANGE":
      return "bg-amber-100 text-amber-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "SENT":
      return "bg-blue-100 text-blue-800";
    case "SAVED":
    case "DRAFT":
    default:
      return "bg-gray-100 text-gray-800";
  }
}

const EDITABLE_STATUSES: LiquidationStatus[] = [
  "SAVED",
  "REQUESTED_FOR_CHANGE",
];

export function LiquidationForm({
  userId,
  initialControlNo = "",
  restrictToOther = false,
}: {
  userId: string;
  initialControlNo?: string;
  /** When true, forces "Other (No FTI)" mode and hides the FTI type selector. */
  restrictToOther?: boolean;
}) {
  const [items, setItems] = useState<ReceiptItemInput[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Active SAVED liquidation returned by createDraft (first Add Item click).
  const [liquidationId, setLiquidationId] = useState("");

  // FTI link (ControlNo) — empty means an "Other" liquidation without an FTI.
  const [ftiRequests, setFtiRequests] = useState<FTIRequestSummary[]>([]);
  // Liquidation type: "fti" (linked to an FTI) or "other" (no FTI).
  const [liqType, setLiqType] = useState<"fti" | "other">(
    initialControlNo ? "fti" : "fti",
  );
  const [controlNo, setControlNo] = useState(initialControlNo);
  const [loadingFti, setLoadingFti] = useState(true);
  const [loadingLiquidation, setLoadingLiquidation] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lastLoadedControlNo, setLastLoadedControlNo] = useState("");
  // Manual TotalAmountRequested for "Other" liquidations (no FTI ControlNo).
  const [totalAmountRequested, setTotalAmountRequested] = useState("");
  // Existing "Other" (no-FTI) liquidations the user can reopen and edit.
  const [otherLiquidations, setOtherLiquidations] = useState<LiquidationFull[]>(
    [],
  );
  const [selectedOtherId, setSelectedOtherId] = useState("");
  // Miscellaneous category options (fetched via the same source as the FTI page).
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  // Preview / export state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  // Full name resolved from the Users sheet (fallback to localStorage).
  const [resolvedFullName, setResolvedFullName] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Support deep-link: /dashboard/expense-liquidation?controlNo=CTRL-...
    let preselected = "";
    if (typeof window !== "undefined") {
      preselected =
        new URLSearchParams(window.location.search).get("controlNo") || "";
    }
    (async () => {
      try {
        const requests = await ftiService.getRequests();
        if (!cancelled) {
          // Technicians can only link to their own FTI requests (the API
          // already restricts to session user for non-admins). Disregard
          // DRAFT and SAVED, and sort latest to oldest by dateCreated.
          const myId = userId;
          const usable = requests
            .filter((r) => r.status !== "SAVED" && (!myId || r.userId === myId))
            .sort((a, b) =>
              (b.dateCreated || "").localeCompare(a.dateCreated || ""),
            );
          setFtiRequests(usable);
          // Pre-select the deep-linked ControlNo if it is one of the usable
          // requests (e.g. clicked "Add Liquidation" from the FTI page).
          if (preselected && usable.some((r) => r.controlNo === preselected)) {
            setControlNo(preselected);
          }
        }
      } catch (error) {
        console.error("Failed to load FTI requests:", error);
      } finally {
        if (!cancelled) setLoadingFti(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the user's existing "Other" (no-FTI) liquidations so they can be
  // reopened and further edited.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const others = await liquidationService.getOtherLiquidations();
        if (!cancelled) {
          // Only show the signed-in user's OWN no-FTI liquidations to
          // reopen/edit. getMyLiquidations() may also include liquidations
          // the user approves on behalf of others.
          setOtherLiquidations(
            others.filter((l) => !l.controlNo && l.userId === userId),
          );
        }
      } catch (error) {
        console.error("Failed to load other liquidations:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load miscellaneous categories (same source as the FTI page dropdown).
  // Stores the code (e.g. "MEAL") as the category value; the description
  // (e.g. "Meal") is resolved for display via a lookup map.
  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await miscellaneousService.getAll();
        if (!cancelled) {
          setCategories(all.map((m) => m.code).filter(Boolean));
          setMiscLookup(new Map(all.map((m) => [m.code, m.description])));
        }
      } catch (error) {
        console.error("Failed to load miscellaneous categories:", error);
        if (!cancelled) {
          toast.error("Failed to load receipt categories.");
        }
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the technician's full name from the Users sheet so the printed /
  // previewed document shows the real name (not just the localStorage copy).
  useEffect(() => {
    let cancelled = false;

    if (!userId) return;
    (async () => {
      try {
        const profile = await userService.getUserById(userId);

        if (!cancelled && profile?.fullName) {
          setResolvedFullName(profile.fullName);
        }
      } catch (error) {
        // Fall back to the localStorage fullName/userName.
        console.debug("Failed to resolve user fullName:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // When the selected FTI ControlNo changes, restore the existing
  // liquidation (its liquidationId + receipt items). This is the core fix
  // for the bug where re-selecting an FTI showed an empty receipt list.
  // When ControlNo is empty ("Other" liquidation), we start fresh.
  useEffect(() => {
    let cancelled = false;
    const controlNoToLoad = controlNo.trim();
    if (!controlNoToLoad) {
      // Switching to an "Other" liquidation without an FTI: reset batch.
      setLiquidationId("");
      setItems([]);
      setIsLocked(false);
      setLastLoadedControlNo("");
      setTotalAmountRequested("");
      return;
    }

    // If we already restored this ControlNo, don't re-fetch.
    if (lastLoadedControlNo === controlNoToLoad) return;

    setLoadingLiquidation(true);
    (async () => {
      try {
        const liquidation =
          await liquidationService.getByControlNo(controlNoToLoad);
        if (cancelled) return;
        if (liquidation) {
          setLiquidationId(liquidation.liquidationId);
          const receiptItems: ReceiptItemInput[] = liquidation.items.map(
            (item) => ({
              date: item.date,
              description: item.description,
              category: item.category,
              amount: item.amount,
              receiptImageUrl: item.receiptImageUrl || undefined,
              // The API does not return preview/type metadata; reconstruct
              // preview from the Drive URL when rendering.
            }),
          );
          setItems(receiptItems);
          setIsLocked(
            !EDITABLE_STATUSES.includes(
              (liquidation.status || "").toUpperCase() as LiquidationStatus,
            ),
          );
          toast.success(
            `Loaded existing liquidation (${liquidation.items.length} receipt item(s)).`,
          );
        } else {
          // Fresh ControlNo → start a brand new batch.
          setLiquidationId("");
          setItems([]);
          setIsLocked(false);
        }
        setLastLoadedControlNo(controlNoToLoad);
      } catch (error) {
        console.error("Failed to load liquidation by controlNo:", error);
        if (!cancelled) {
          toast.error("Failed to load existing receipts for this FTI.");
        }
      } finally {
        if (!cancelled) setLoadingLiquidation(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controlNo, lastLoadedControlNo]);

  // When returning to "Other" (no FTI) with an existing "Other" liquidation
  // still selected (selectedOtherId), re-load its receipt items AFTER the FTI
  // effect above clears state on controlNo="" (switching back to "Other").
  useEffect(() => {
    if (liqType === "other" && selectedOtherId) {
      const found = otherLiquidations.find(
        (l) => l.liquidationId === selectedOtherId,
      );
      if (found) {
        setLiquidationId(found.liquidationId);
        setItems(
          found.items.map((item) => ({
            date: item.date,
            description: item.description,
            category: item.category,
            amount: item.amount,
            receiptImageUrl: item.receiptImageUrl || undefined,
          })),
        );
        setTotalAmountRequested(
          found.totalAmountRequested != null
            ? String(found.totalAmountRequested)
            : "",
        );
        setIsLocked(
          !EDITABLE_STATUSES.includes(
            (found.status || "").toUpperCase() as LiquidationStatus,
          ),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liqType, selectedOtherId, otherLiquidations]);

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

  const isOther = liqType === "other";
  // The FTI request currently linked via the ControlNo (used for Advances).
  const selectedFti = ftiRequests.find((r) => r.controlNo === controlNo);
  const ftiAdvances = selectedFti?.totalAmount || 0;
  // The manual TotalAmountRequested to persist for an "Other" liquidation.
  const requestedAmountParsed = parseFloat(totalAmountRequested);
  const effectiveRequestedAmount = isOther
    ? isNaN(requestedAmountParsed) || requestedAmountParsed < 0
      ? 0
      : requestedAmountParsed
    : ftiAdvances;
  const advances = isOther ? effectiveRequestedAmount : ftiAdvances;

  // Dynamic settlement label/value based on comparison of expenses vs advances.
  const difference = totalAmount - advances;
  const hasAdvances = advances > 0;
  const hasAmountToReturn = hasAdvances && difference < 0;
  const settlement = hasAmountToReturn
    ? { label: "Amount to Return" }
    : !hasAdvances
      ? { label: "Total Reimbursement" }
      : difference > 0
        ? {
            label: "Total Reimbursement",
            hint: "(Positive Amount — Company pays employee)",
          }
        : { label: "Net Amount Due / Settled", hint: "(₱0.00)" };
  const settlementValue = hasAmountToReturn
    ? difference
    : !hasAdvances || difference === 0
      ? difference === 0
        ? 0
        : totalAmount
      : difference;

  // Categories used as column headers — exclude "Others" since there's a
  // dedicated catch-all "Others" column in the pivot table.
  const allCategories = categories.filter((c) => c !== "Others");

  // Per-category column subtotals for the pivot table.
  const categoryTotals = Object.fromEntries(
    allCategories.map((cat) => [
      cat,
      items
        .filter((i) => i.category === cat)
        .reduce((s, i) => s + (i.amount || 0), 0),
    ]),
  );

  // Only show columns that have at least one item using them.
  const displayCategories = allCategories.filter((cat) => categoryTotals[cat] > 0);

  const othersTotal = items
    .filter((i) => !allCategories.includes(i.category))
    .reduce((s, i) => s + (i.amount || 0), 0);

  // Sort items by date ascending for display.
  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));

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
    if (isLocked) {
      toast.error(
        "This liquidation has been submitted and can no longer be edited.",
      );
      return;
    }
    if (isOther && requestedAmountParsed < 0) {
      toast.error("Please enter a valid Total Amount Requested.");
      return;
    }
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

    setUploading(true);
    try {
      if (editingIndex !== null) {
        const updated = items.map((existing, idx) =>
          idx === editingIndex ? item : existing,
        );
        await liquidationService.replace(liquidationId, updated);
        setItems(updated);
        toast.success("Receipt item updated.");
        resetDraft();
      } else {
        let activeId = liquidationId;
        if (!activeId) {
          const draft = await liquidationService.createDraft(
            controlNo,
            isOther ? effectiveRequestedAmount : undefined,
          );
          activeId = draft.liquidationId;
          setLiquidationId(activeId);
        }
        await liquidationService.addItem(activeId, [item]);
        setItems((prev) => [...prev, item]);
        toast.success("Receipt item added.");
        resetDraft();
      }
    } catch (error) {
      console.error("Failed to persist receipt item:", error);
      // Keep the draft intact (date/description/category/amount and the
      // already-uploaded Drive receipt URL) so the user can simply click
      // "Add Item" again and retry WITHOUT re-uploading the receipt.
      toast.error("Failed to save receipt item. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleEditItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (isLocked) {
      toast.error(
        "This liquidation has been submitted and can no longer be edited.",
      );
      return;
    }
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
      item.receiptIsImage ??
        (item.receiptImageUrl ? isImageUrl(item.receiptImageUrl) : true),
    );
    setDraftReceiptName(item.receiptImageUrl ? "Receipt attached" : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteItem = async (index: number) => {
    if (isLocked) {
      toast.error(
        "This liquidation has been submitted and can no longer be edited.",
      );
      return;
    }
    const remaining = items.filter((_, idx) => idx !== index);
    setUploading(true);
    try {
      await liquidationService.replace(liquidationId, remaining);
      setItems(remaining);
      if (editingIndex === index) {
        resetDraft();
      }
      toast.success("Receipt item removed.");
    } catch (error) {
      console.error("Failed to remove receipt item:", error);
      toast.error("Failed to remove receipt item. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ── Submit (flips status SAVED → SUBMITTED + auto-assigns approver) ──
  const handleSubmit = async () => {
    if (isLocked) {
      toast.error("This liquidation has already been submitted.");
      return;
    }
    if (!liquidationId) {
      toast.error(
        "No active liquidation to submit. Add at least one item first.",
      );
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one receipt item before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await liquidationService.submit(liquidationId);
      setSubmittedTotal(totalAmount);
      setSuccessLiquidationId(result.liquidationId);
      toast.success(`Liquidation submitted! ID: ${result.liquidationId}`);
      // Clear the form for the next batch
      setItems([]);
      setLiquidationId("");
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

  // ── Preview → PDF / Image export (mirrors the FTI page flow) ──
  const getLiquidationPrintElement = () =>
    document.getElementById("liquidation-print-content");

  const generatePdfBlob = async (): Promise<Blob> => {
    const element = getLiquidationPrintElement();
    if (!element) throw new Error("Liquidation document not found.");
    await new Promise((r) => setTimeout(r, 150));
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
    });
    const { jsPDF } = await import("jspdf");
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    let heightLeft = imgHeight - pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    return pdf.output("blob");
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LIQUIDATION_${controlNo || "draft"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Liquidation PDF downloaded.");
    } catch (error) {
      console.error("Liquidation PDF export failed:", error);
      toast.error("Failed to generate liquidation PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    setDownloadingImage(true);
    try {
      const element = getLiquidationPrintElement();
      if (!element) throw new Error("Liquidation document not found.");
      await new Promise((r) => setTimeout(r, 150));
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `LIQUIDATION_${controlNo || "draft"}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Liquidation image downloaded.");
    } catch (error) {
      console.error("Liquidation image export failed:", error);
      toast.error("Failed to generate liquidation image.");
    } finally {
      setDownloadingImage(false);
    }
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
            Linked FTI:{" "}
            <span className="font-mono font-semibold text-foreground">
              {controlNo}
            </span>
          </p>
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
            <p className="truncate font-medium">{resolvedFullName}</p>
          </div>
          <div className="shrink-0 rounded-lg border bg-muted px-4 py-2 text-right">
            <Label className="text-[10px] text-muted-foreground">Total</Label>
            <p className="text-lg font-bold tracking-tight">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Link to FTI (ControlNo) or "Other" liquidation ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Liquidation Type</CardTitle>
          <CardDescription>
            {restrictToOther
              ? "Create an expense liquidation without an FTI ControlNo."
              : 'Link to an FTI, or create an "Other" liquidation without an FTI ControlNo.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {!restrictToOther && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={!isOther ? "default" : "outline"}
                  onClick={() => {
                    setLiqType("fti");
                    // Clear any loaded "Other" state so the FTI view starts fresh.
                    setLiquidationId("");
                    setItems([]);
                    setSelectedOtherId("");
                    setTotalAmountRequested("");
                    setIsLocked(false);
                    setLastLoadedControlNo("");
                  }}
                >
                  FTI Linked
                </Button>
                <Button
                  type="button"
                  variant={isOther ? "default" : "outline"}
                  onClick={() => {
                    setLiqType("other");
                    setControlNo("");
                    setLastLoadedControlNo("");
                    // Clear any loaded FTI state so the Other view starts fresh.
                    setLiquidationId("");
                    setItems([]);
                    setSelectedOtherId("");
                    setTotalAmountRequested("");
                    setIsLocked(false);
                  }}
                >
                  Other (No FTI)
                </Button>
              </div>
            )}

            {isOther || restrictToOther ? (
              <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                {/* ── Reopen an existing no-FTI liquidation ── */}
                <div className="space-y-2">
                  <Label>Existing "Other" Liquidation</Label>
                  <Select
                    value={selectedOtherId}
                    onValueChange={(id) => {
                      const found = otherLiquidations.find(
                        (l) => l.liquidationId === id,
                      );
                      if (!found) return;
                      setSelectedOtherId(id);
                      setLiquidationId(id);
                      setItems(
                        found.items.map((item) => ({
                          date: item.date,
                          description: item.description,
                          category: item.category,
                          amount: item.amount,
                          receiptImageUrl: item.receiptImageUrl || undefined,
                        })),
                      );
                      setTotalAmountRequested(
                        found.totalAmountRequested != null
                          ? String(found.totalAmountRequested)
                          : "",
                      );
                      setIsLocked(
                        !EDITABLE_STATUSES.includes(
                          (
                            found.status || ""
                          ).toUpperCase() as LiquidationStatus,
                        ),
                      );
                      toast.success(
                        `Opened liquidation (${found.items.length} receipt item(s)).`,
                      );
                    }}
                  >
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="Select existing liquidation" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherLiquidations.length === 0 ? (
                        <p className="px-4 py-2 text-sm text-muted-foreground">
                          No existing "Other" liquidations yet.
                        </p>
                      ) : (
                        otherLiquidations.map((liq) => (
                          <SelectItem
                            key={liq.liquidationId}
                            value={liq.liquidationId}
                          >
                            {liq.status} • ₱
                            {liq.totalAmount?.toFixed?.(2) ?? (0).toFixed(2)} •{" "}
                            {liq.items.length} item(s)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Pick an existing no-FTI liquidation to reopen and add/edit
                    its receipts, or leave blank to start a new one.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Total Amount Requested (₱)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={totalAmountRequested}
                    onChange={(e) => setTotalAmountRequested(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the total amount requested for this liquidation since
                    there is no FTI ControlNo.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>FTI Control Number</Label>
                {loadingFti ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading FTI requests...
                  </div>
                ) : (
                  <Select value={controlNo} onValueChange={setControlNo}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="Select FTI control no." />
                    </SelectTrigger>
                    <SelectContent>
                      {ftiRequests.length === 0 ? (
                        <p className="px-4 py-2 text-sm text-muted-foreground">
                          No available FTI requests to link.
                        </p>
                      ) : (
                        ftiRequests.map((request) => (
                          <SelectItem
                            key={request.controlNo}
                            value={request.controlNo}
                          >
                            {request.controlNo}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}

                {/* ── ControlNo preview panel ── */}
                {(() => {
                  const selected = selectedFti;
                  if (!selected) return null;
                  return (
                    <div className="mt-3 space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Status</span>
                        <Badge
                          className={statusBadgeClass(selected.status)}
                          variant="outline"
                        >
                          {selected.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          Date Created
                        </span>
                        <span className="font-medium">
                          {selected.dateCreated}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          FTI Total Amount
                        </span>
                        <span className="font-bold">
                          {formatCurrency(selected.totalAmount || 0)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
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
                {loadingCategories ? (
                  <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading categories...
                  </div>
                ) : categories.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-muted-foreground">
                    No miscellaneous categories available.
                  </p>
                ) : (
                  categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {miscLookup.get(category) || category}
                    </SelectItem>
                  ))
                )}
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
            disabled={uploading || isLocked}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {editingIndex !== null ? "Updating..." : "Adding..."}
              </>
            ) : editingIndex !== null ? (
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

      {/* ── Itemized summary (pivot table: Date | Description | <categories> | Others | Total) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Receipt Items</CardTitle>
              <CardDescription>
                {items.length === 0
                  ? "No items added yet."
                  : `${items.length} item(s) — Total: ${formatCurrency(totalAmount)}`}
                {isLocked && " (Locked — already submitted)"}
                {loadingLiquidation && " (Loading…)"}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={items.length === 0 || loadingLiquidation}
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingLiquidation ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading receipts…
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Add receipt items above to build your liquidation batch.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      {displayCategories.map((cat) => (
                        <TableHead key={cat} className="text-right">
                          {miscLookup.get(cat) || cat}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Receipt</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item, index) => {
                      // Resolve the original index in the unsorted items array
                      // so edit/delete operations target the correct item.
                      const originalIndex = items.indexOf(item);
                      const isKnownCategory = displayCategories.includes(
                        item.category,
                      );
                      const isImage =
                        item.receiptIsImage ??
                        (item.receiptImageUrl
                          ? isImageUrl(item.receiptImageUrl)
                          : true);
                      return (
                        <TableRow key={`${item.date}-${originalIndex}`}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {item.date}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.description}
                          </TableCell>
                          {displayCategories.map((cat) => (
                            <TableCell
                              key={cat}
                              className="text-right font-mono"
                            >
                              {item.category === cat
                                ? formatCurrency(item.amount)
                                : ""}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-mono">
                            {!isKnownCategory
                              ? formatCurrency(item.amount)
                              : ""}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(item.amount)}
                          </TableCell>
                          <TableCell className="text-center">
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
                                      item.receiptPreviewUrl ||
                                      item.receiptImageUrl
                                    }
                                    alt="Receipt"
                                    className="mx-auto h-12 w-12 rounded-lg border object-cover"
                                  />
                                ) : (
                                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border bg-muted">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                aria-label="Edit item"
                                onClick={() => handleEditItem(originalIndex)}
                                disabled={isLocked || uploading}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive"
                                aria-label="Delete item"
                                onClick={() => handleDeleteItem(originalIndex)}
                                disabled={isLocked || uploading}
                              >
                                {uploading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    {/* ── Subtotal row (per-category sums) ── */}
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold">
                        Subtotal
                      </TableCell>
                      {displayCategories.map((cat) => (
                        <TableCell key={cat} className="text-right font-mono">
                          {categoryTotals[cat]
                            ? formatCurrency(categoryTotals[cat])
                            : ""}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono">
                        {othersTotal ? formatCurrency(othersTotal) : ""}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totalAmount)}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                    {/* ── Grand Total row ── */}
                    <TableRow>
                      <TableCell
                        colSpan={displayCategories.length + 3}
                        className="font-semibold"
                      >
                        Grand Total
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totalAmount)}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* ── Summary block (bottom right) ── */}
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-1 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Total Expenses
                    </span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cash Advances</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(advances)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2 border-t pt-1">
                    <span className="font-semibold">
                      {settlement.label}
                      {settlement.hint && (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {settlement.hint}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono font-bold">
                      {formatCurrency(settlementValue)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Preview modal + off-screen printable document ── */}
      <LiquidationPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        controlNo={controlNo}
        fullName={resolvedFullName}
        items={items}
        categories={categories}
        miscLookup={miscLookup}
        advances={advances}
        onDownloadPdf={handleDownloadPdf}
        downloadingPdf={downloadingPdf}
        onDownloadImage={handleDownloadImage}
        downloadingImage={downloadingImage}
      />
      <div className="fixed -left-[9999px] top-0" aria-hidden="true">
        <LiquidationPrintDocument
          controlNo={controlNo}
          fullName={resolvedFullName}
          items={items}
          categories={categories}
          miscLookup={miscLookup}
          advances={advances}
          id="liquidation-print-content"
        />
      </div>

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
            disabled={submitting || items.length === 0 || isLocked}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : isLocked ? (
              <Lock className="mr-2 h-5 w-5" />
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

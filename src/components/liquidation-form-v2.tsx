"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Eye,
  Camera,
  Upload,
  X,
  CheckCircle2,
  Send,
  Lock,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { toast } from "sonner";
import { liquidationV2Service } from "@/lib/services/liquidation-v2.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { userService } from "@/lib/services/user.service";
import { ftiService } from "@/lib/services/fti.service";
import type { FTIRequestSummary } from "@/types/fti";
import LiquidationPreviewModalV2 from "@/components/liquidation-preview-modal-v2";
import LiquidationPrintDocumentV2 from "@/components/liquidation-print-document-v2";
import type {
  LiquidationFullV2,
  ReceiptItemV2Input,
} from "@/types/liquidation-v2";

const EDITABLE_STATUSES = ["SAVED", "REQUESTED_FOR_CHANGE"];

/** Maps FTI request statuses to badge tailwind classes (matches production). */
function statusBadgeClass(status: string): string {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REQUESTED_FOR_CHANGE":
      return "bg-amber-100 text-amber-800";
    case "SUBMITTED":
    case "SENT":
      return "bg-blue-100 text-blue-800";
    case "DRAFT":
    case "SAVED":
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Labeled text input. `uppercase` renders the value in caps (CSS transform +
 * stored value normalization) so free-text fields are ALWAYS uppercase.
 */
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  uppercase = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  uppercase?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) =>
          onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)
        }
        className={uppercase ? "h-11 text-base uppercase" : "h-11 text-base"}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LiquidationFormV2({
  userId,
  onCancel,
  editingLiquidation,
  restrictToOther = false,
}: {
  userId: string;
  onCancel?: () => void;
  editingLiquidation?: LiquidationFullV2 | null;
  /** When true, forces "Other (No FTI)" mode (mirrors production). */
  restrictToOther?: boolean;
}) {
  const isEditing = !!editingLiquidation;
  const isLocked =
    isEditing &&
    !EDITABLE_STATUSES.includes(
      (editingLiquidation?.status || "").toUpperCase(),
    );

  // Active liquidation: created lazily on the first Add Item, or the one being edited.
  const [liquidationId, setLiquidationId] = useState(
    editingLiquidation?.liquidationId || "",
  );

  // ── Liquidation type: "fti" (linked to an FTI) or "other" (no FTI) ──
  const [ftiRequests, setFtiRequests] = useState<FTIRequestSummary[]>([]);
  const [loadingFti, setLoadingFti] = useState(true);
  const [liqType, setLiqType] = useState<"fti" | "other">(() =>
    editingLiquidation
      ? editingLiquidation.controlNo
        ? "fti"
        : "other"
      : restrictToOther
        ? "other"
        : "fti",
  );
  const [controlNo, setControlNo] = useState(
    editingLiquidation?.controlNo || "",
  );
  // Manual Total Amount Requested for "Other" liquidations (no FTI ControlNo).
  const [totalAmountRequested, setTotalAmountRequested] = useState(
    editingLiquidation && !editingLiquidation.controlNo
      ? editingLiquidation.totalAmountRequested != null
        ? String(editingLiquidation.totalAmountRequested)
        : ""
      : "",
  );

  // ── Items (restored from an editing liquidation) ──
  const [items, setItems] = useState<ReceiptItemV2Input[]>(() =>
    editingLiquidation
      ? editingLiquidation.items.map((it) => ({
          date: it.date,
          description: it.description,
          miscellaneousCode: it.miscellaneousCode,
          amount: it.amount,
          receiptImageUrl: it.receiptImageUrl || undefined,
          siNumber: it.siNumber || undefined,
          drNumber: it.drNumber || undefined,
          crNumber: it.crNumber || undefined,
          bsNumber: it.bsNumber || undefined,
          orNumber: it.orNumber || undefined,
          refNo: it.refNo || undefined,
          tin: it.tin || undefined,
          supplierName: it.supplierName || undefined,
          address: it.address || undefined,
          checkNo: it.checkNo || undefined,
          cvNo: it.cvNo || undefined,
          particulars: it.particulars || undefined,
          grossAmount: it.grossAmount || undefined,
          vat: it.vat || undefined,
          ewt: it.ewt || undefined,
        }))
      : [],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // ── Vendor Information (batch-level; stamped on every line item) ──
  const [supplierName, setSupplierName] = useState(
    editingLiquidation?.items[0]?.supplierName || "",
  );
  const [supplierAddress, setSupplierAddress] = useState(
    editingLiquidation?.items[0]?.address || "",
  );
  const [tin, setTin] = useState(editingLiquidation?.items[0]?.tin || "");
  const [refNo, setRefNo] = useState(editingLiquidation?.items[0]?.refNo || "");

  // ── Miscellaneous categories (value = code, label = description) ──
  const [categories, setCategories] = useState<string[]>([]);
  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [resolvedFullName, setResolvedFullName] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successLiquidationId, setSuccessLiquidationId] = useState<
    string | null
  >(null);
// ── Line-item draft state ──
  const [draftDate, setDraftDate] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  // Gross Amount is the required amount; Net / VAT / EWT are optional manual.
  const [draftGross, setDraftGross] = useState("");
  const [draftNet, setDraftNet] = useState("");
  const [draftVat, setDraftVat] = useState("");
  const [draftEwt, setDraftEwt] = useState("");
  // Document references (no per-doc dates — the item Date applies).
  const [draftSiNo, setDraftSiNo] = useState("");
  const [draftDrNo, setDraftDrNo] = useState("");
  const [draftCrNo, setDraftCrNo] = useState("");
  const [draftBsNo, setDraftBsNo] = useState("");
  const [draftOrNo, setDraftOrNo] = useState("");
  // Accounting references.
  const [draftCheckNo, setDraftCheckNo] = useState("");
  const [draftCvNo, setDraftCvNo] = useState("");
  // Receipt upload.
  const [draftReceiptUrl, setDraftReceiptUrl] = useState("");
  const [draftReceiptPreviewUrl, setDraftReceiptPreviewUrl] = useState("");
  const [draftReceiptFile, setDraftReceiptFile] = useState<File | null>(null);
  const [draftPreviewSrc, setDraftPreviewSrc] = useState("");
  const [draftReceiptIsImage, setDraftReceiptIsImage] = useState(true);
  const [draftReceiptName, setDraftReceiptName] = useState("");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOther = liqType === "other" || restrictToOther;
  const selectedFti = ftiRequests.find((r) => r.controlNo === controlNo);
  const requestedParsed = parseFloat(totalAmountRequested);
  const requestedAmount =
    isNaN(requestedParsed) || requestedParsed < 0 ? 0 : requestedParsed;

  const totalAmount = items.reduce((sum, it) => sum + (it.amount || 0), 0);
  const grossTotal = items.reduce((sum, it) => sum + (it.grossAmount || 0), 0);
  const vatTotal = items.reduce((sum, it) => sum + (it.vat || 0), 0);
  const ewtTotal = items.reduce((sum, it) => sum + (it.ewt || 0), 0);

  const categoryTotals = Object.fromEntries(
    categories.map((cat) => [
      cat,
      items
        .filter((it) => it.miscellaneousCode === cat)
        .reduce((s, it) => s + (it.amount || 0), 0),
    ]),
  );
  // Only show columns that have at least one item using them.
  const displayCategories = categories.filter(
    (cat) => categoryTotals[cat] > 0,
  );
  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);
// Load the user's APPROVED FTI requests to select from (mirrors production).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const requests = await ftiService.getRequests();
        if (!cancelled) {
          const usable = requests
            .filter(
              (r) =>
                r.status.toUpperCase() === "APPROVED" &&
                (!userId || r.userId === userId),
            )
            .sort((a, b) =>
              (b.dateCreated || "").localeCompare(a.dateCreated || ""),
            );
          setFtiRequests(usable);
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
  }, [userId]);

  // Load miscellaneous categories (value = code, display = description).
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
        if (!cancelled) toast.error("Failed to load receipt categories.");
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the requester's full name from the Users sheet.
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
        console.debug("Failed to resolve user fullName:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ── Type switch handlers ──
  const handleTypeChange = (linkedToFti: boolean) => {
    if (restrictToOther || isEditing || isLocked) return;
    if (linkedToFti) {
      // FTI Linked
      setLiqType("fti");
      setLiquidationId("");
      setItems([]);
      setTotalAmountRequested("");
    } else {
      // No FTI (Other)
      setLiqType("other");
      setControlNo("");
      setLiquidationId("");
      setItems([]);
      setTotalAmountRequested("");
    }
  };
const resetDraft = () => {
    setEditingIndex(null);
    setDraftDate("");
    setDraftCategory("");
    setDraftDescription("");
    setDraftGross("");
    setDraftNet("");
    setDraftVat("");
    setDraftEwt("");
    setDraftSiNo("");
    setDraftDrNo("");
    setDraftCrNo("");
    setDraftBsNo("");
    setDraftOrNo("");
    setDraftCheckNo("");
    setDraftCvNo("");
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(null);
    setDraftPreviewSrc("");
    setDraftReceiptUrl("");
    setDraftReceiptPreviewUrl("");
    setDraftReceiptIsImage(true);
    setDraftReceiptName("");
  };

  const handleFileSelected = (file?: File) => {
    if (!file) return;
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(file);
    setDraftPreviewSrc(URL.createObjectURL(file));
    setDraftReceiptIsImage(file.type.startsWith("image/"));
    setDraftReceiptName(file.name);
    setDraftReceiptUrl("");
    setDraftReceiptPreviewUrl("");
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

  const numOrUndef = (v: string): number | undefined => {
    if (v === "" || v == null) return undefined;
    const n = parseFloat(v);
    return isNaN(n) ? undefined : Math.round(n * 100) / 100;
  };

  // ── Line-item add / update ──
  const handleAddOrUpdateItem = async () => {
    if (isLocked) {
      toast.error(
        "This liquidation has been submitted and can no longer be edited.",
      );
      return;
    }
    if (!draftDate) {
      toast.error("Please select a date.");
      return;
    }
    if (!draftCategory) {
      toast.error("Please select a category.");
      return;
    }
    if (!draftDescription.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    const gross = parseFloat(draftGross);
    if (isNaN(gross) || gross < 0) {
      toast.error("Please enter a valid Gross Amount.");
      return;
    }
    const vat = numOrUndef(draftVat) || 0;
    const ewt = numOrUndef(draftEwt) || 0;
    const manualNet = numOrUndef(draftNet);
    // Net = manual Net if provided, else auto Gross − VAT − EWT.
    const net =
      manualNet != null
        ? Math.max(0, manualNet)
        : Math.max(0, Math.round((gross - vat - ewt) * 100) / 100);
let finalReceiptUrl = draftReceiptUrl;
    let finalReceiptPreviewUrl = draftReceiptPreviewUrl;
    let uploadedFileId = "";

    if (draftReceiptFile && !draftReceiptUrl) {
      setUploading(true);
      try {
        const result =
          await liquidationV2Service.uploadReceipt(draftReceiptFile);
        finalReceiptUrl = result.receiptImageUrl;
        finalReceiptPreviewUrl = result.proxyUrl;
        uploadedFileId = result.fileId || "";
      } catch (error) {
        console.error("Receipt upload failed:", error);
        const message =
          error instanceof Error ? error.message : "Unknown upload error.";
        toast.error(`Upload failed: ${message}`);
        return;
      } finally {
        setUploading(false);
      }
    }

    // Particulars = the Miscellaneous Description (same as Category label).
    const miscDescription = miscLookup.get(draftCategory) || draftCategory;

    const item: ReceiptItemV2Input = {
      date: draftDate,
      description: draftDescription.trim().toUpperCase(),
      miscellaneousCode: draftCategory,
      amount: net,
      grossAmount: gross,
      vat: vat > 0 ? vat : undefined,
      ewt: ewt > 0 ? ewt : undefined,
      particulars: miscDescription,
      siNumber: draftSiNo.trim() || undefined,
      drNumber: draftDrNo.trim() || undefined,
      crNumber: draftCrNo.trim() || undefined,
      bsNumber: draftBsNo.trim() || undefined,
      orNumber: draftOrNo.trim() || undefined,
      checkNo: draftCheckNo.trim() || undefined,
      cvNo: draftCvNo.trim() || undefined,
      // Batch-level vendor info is stamped onto every line item.
      refNo: refNo || undefined,
      tin: tin || undefined,
      supplierName: supplierName || undefined,
      address: supplierAddress || undefined,
      receiptImageUrl: finalReceiptUrl || undefined,
      receiptPreviewUrl: finalReceiptPreviewUrl || undefined,
      receiptIsImage: finalReceiptUrl ? draftReceiptIsImage : undefined,
    };

    setUploading(true);
    try {
      if (editingIndex !== null) {
        const updated = items.map((existing, idx) =>
          idx === editingIndex ? item : existing,
        );
        await liquidationV2Service.replace(liquidationId, updated);
        setItems(updated);
        toast.success("Receipt item updated.");
        resetDraft();
      } else {
        let activeId = liquidationId;
        if (!activeId) {
          const draft = await liquidationV2Service.createDraft(
            controlNo,
            isOther ? requestedAmount : undefined,
          );
          activeId = draft.liquidationId;
          setLiquidationId(activeId);
        }
        await liquidationV2Service.addItem(activeId, [item]);
        setItems((prev) => [...prev, item]);
        toast.success("Receipt item added.");
        resetDraft();
      }
    } catch (error) {
      console.error("Failed to persist receipt item:", error);
      if (uploadedFileId) {
        try {
          await liquidationV2Service.deleteReceipt(uploadedFileId);
          console.info("Rolled back orphaned receipt file:", uploadedFileId);
        } catch (rollbackError) {
          console.error("Failed to roll back receipt file:", rollbackError);
        }
      }
      setDraftReceiptFile(null);
      if (draftPreviewSrc) {
        URL.revokeObjectURL(draftPreviewSrc);
        setDraftPreviewSrc("");
      }
      setDraftReceiptUrl("");
      setDraftReceiptPreviewUrl("");
      setDraftReceiptName("");
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message
          ? `Failed to save receipt item: ${message}`
          : "Failed to save receipt item. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };
const handleEditItem = (index: number) => {
    const it = items[index];
    if (!it) return;
    if (isLocked) {
      toast.error(
        "This liquidation has been submitted and can no longer be edited.",
      );
      return;
    }
    if (draftPreviewSrc) URL.revokeObjectURL(draftPreviewSrc);
    setDraftReceiptFile(null);
    setDraftPreviewSrc("");
    setEditingIndex(index);
    setDraftDate(it.date);
    setDraftCategory(it.miscellaneousCode);
    setDraftDescription(it.description);
    setDraftGross(it.grossAmount != null ? String(it.grossAmount) : "");
    setDraftNet(it.amount != null ? String(it.amount) : "");
    setDraftVat(it.vat != null ? String(it.vat) : "");
    setDraftEwt(it.ewt != null ? String(it.ewt) : "");
    setDraftSiNo(it.siNumber || "");
    setDraftDrNo(it.drNumber || "");
    setDraftCrNo(it.crNumber || "");
    setDraftBsNo(it.bsNumber || "");
    setDraftOrNo(it.orNumber || "");
    setDraftCheckNo(it.checkNo || "");
    setDraftCvNo(it.cvNo || "");
    setDraftReceiptUrl(it.receiptImageUrl || "");
    setDraftReceiptPreviewUrl(it.receiptPreviewUrl || "");
    setDraftReceiptIsImage(
      it.receiptIsImage ?? (it.receiptImageUrl ? true : true),
    );
    setDraftReceiptName(it.receiptImageUrl ? "Receipt attached" : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteItem = async (index: number) => {
    if (isLocked) {
      toast.error(
        "This liquidation has been submitted and can no longer be edited.",
      );
      return;
    }
    if (!liquidationId) {
      toast.error("No active liquidation to remove from. Add an item first.");
      return;
    }
    const remaining = items.filter((_, idx) => idx !== index);
    setUploading(true);
    try {
      await liquidationV2Service.replace(liquidationId, remaining);
      setItems(remaining);
      toast.success("Receipt item removed.");
    } catch (error) {
      console.error("Failed to remove receipt item:", error);
      toast.error("Failed to remove receipt item. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (isLocked) {
      toast.error("This liquidation has already been submitted.");
      return;
    }
    if (!liquidationId) {
      toast.error("No active liquidation to submit. Add at least one item first.");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one receipt item before submitting.");
      return;
    }
    if (isOther && totalAmountRequested === "") {
      toast.error("Please enter the Total Amount Requested.");
      return;
    }
    if (liquidationId) {
      const parsed = parseFloat(totalAmountRequested);
      if (isOther && !isNaN(parsed) && parsed >= 0) {
        try {
          await liquidationV2Service.updateRequestedAmount(
            liquidationId,
            parsed,
          );
        } catch (error) {
          console.error("Failed to persist requested amount:", error);
        }
      }
    }
    setSubmitting(true);
    try {
      const result = await liquidationV2Service.submit(liquidationId);
      toast.success(`Liquidation V2 submitted! ID: ${result.liquidationId}`);
      setSuccessLiquidationId(result.liquidationId);
    } catch (error) {
      console.error("Liquidation V2 submit failed:", error);
      toast.error("Failed to submit liquidation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
// ── Preview → PDF / Image export (mirrors the production flow) ──
  const getLiquidationPrintElement = () =>
    document.getElementById("liquidation-preview-content");

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
      a.download = `LIQUIDATION_V2_${controlNo || "draft"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Liquidation V2 PDF downloaded.");
    } catch (error) {
      console.error("Liquidation V2 PDF export failed:", error);
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
      link.download = `LIQUIDATION_V2_${controlNo || "draft"}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Liquidation V2 image downloaded.");
    } catch (error) {
      console.error("Liquidation V2 image export failed:", error);
      toast.error("Failed to generate liquidation image.");
    } finally {
      setDownloadingImage(false);
    }
  };

  const isImageUrl = (url: string) =>
    /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(url) &&
    !url.includes("drive.google.com");
// ── Success feedback screen ──
  if (successLiquidationId) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-4 px-5 py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <CardTitle className="text-2xl">Liquidation V2 Submitted!</CardTitle>
          <p className="text-muted-foreground">
            Your sandbox expense liquidation was recorded in `ReceiptItems_V2`.
            No production data was modified.
          </p>
          <div className="w-full rounded-lg border bg-muted px-4 py-3 font-mono text-xs break-all sm:text-sm">
            Liquidation ID: {successLiquidationId}
          </div>
          <p className="text-muted-foreground">
            FTI Control No:{" "}
            <span className="font-mono font-semibold text-foreground">
              {controlNo || "—"}
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSuccessLiquidationId(null)}
            >
              Start New
            </Button>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Back to List
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Sandbox banner ── */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
          [TESTING] Expense Liquidation V2
        </p>
        <p className="text-[11px] text-amber-600">
          Writes to ReceiptItems_V2 only — production is untouched.
        </p>
      </div>

      {/* ── Liquidation Type (FTI Linked / No FTI) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Liquidation Type</CardTitle>
          <CardDescription>
            {restrictToOther
              ? "Create an expense liquidation without an FTI ControlNo."
              : isEditing
                ? "Edit the receipts and details for this liquidation."
                : "Link to an APPROVED FTI, or create a \"No FTI\" liquidation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
{!restrictToOther && !isEditing && (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <Switch
                    id="v2-liq-type-switch"
                    checked={liqType === "fti"}
                    onCheckedChange={handleTypeChange}
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="v2-liq-type-switch"
                      className="text-sm font-semibold"
                    >
                      {liqType === "fti" ? "FTI Linked" : "No FTI (Other)"}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {liqType === "fti"
                        ? "Select an APPROVED FTI request to link this liquidation."
                        : "Enter the Total Amount Requested manually."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isOther ? (
              <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                <Field
                  label="Total Amount Requested (₱)"
                  type="number"
                  value={totalAmountRequested}
                  onChange={setTotalAmountRequested}
                  placeholder="0.00"
                  hint="Enter the total amount requested for this liquidation since there is no FTI ControlNo."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>FTI Control No.</Label>
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
                {selectedFti && (
                  <div className="mt-3 space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Status</span>
                      <Badge
                        className={statusBadgeClass(selectedFti.status)}
                        variant="outline"
                      >
                        {selectedFti.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        Date Created
                      </span>
                      <span className="font-medium">
                        {selectedFti.dateCreated}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        FTI Total Amount
                      </span>
                      <span className="font-bold">
                        {formatCurrency(selectedFti.totalAmount || 0)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
{/* ── Vendor Information (full-width rows for mobile) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vendor Information</CardTitle>
          <CardDescription>
            Entered once and stamped on every receipt item you add.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Supplier Name"
            value={supplierName}
            onChange={setSupplierName}
            placeholder="e.g. SHELL GAS STATION"
            uppercase
          />
          <Field
            label="Supplier Address"
            value={supplierAddress}
            onChange={setSupplierAddress}
            placeholder="e.g. BRGY. BANAY BANAY, CABUYAO CITY, LAGUNA"
            uppercase
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="TIN"
              value={tin}
              onChange={setTin}
              placeholder="e.g. 000-000-000-000"
              uppercase
            />
            <Field
              label="Ref No"
              value={refNo}
              onChange={setRefNo}
              placeholder="e.g. REF-101"
              uppercase
            />
          </div>
        </CardContent>
      </Card>
{/* ── Add Receipt Item ── */}
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
          <Field
            label="Date"
            type="date"
            value={draftDate}
            onChange={setDraftDate}
          />

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={draftCategory}
              onValueChange={setDraftCategory}
              disabled={loadingCategories}
            >
              <SelectTrigger className="h-11 text-base">
                <SelectValue
                  placeholder={
                    loadingCategories
                      ? "Loading categories..."
                      : "Select category"
                  }
                />
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
            <p className="text-xs text-muted-foreground">
              {draftCategory
                ? `Selected: ${miscLookup.get(draftCategory) || draftCategory}`
                : "Category selection shows the Miscellaneous description."}
            </p>
          </div>

          <Field
            label="Description"
            value={draftDescription}
            onChange={setDraftDescription}
            placeholder="e.g. LUNCH DURING FIELD SERVICE"
            uppercase
          />
<Field
            label="Gross Amount (₱)"
            type="number"
            value={draftGross}
            onChange={setDraftGross}
            placeholder="0.00"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Net Amount (₱) — optional"
              type="number"
              value={draftNet}
              onChange={setDraftNet}
              placeholder="0.00"
            />
            <Field
              label="VAT (₱) — optional"
              type="number"
              value={draftVat}
              onChange={setDraftVat}
              placeholder="0.00"
            />
            <Field
              label="EWT (₱) — optional"
              type="number"
              value={draftEwt}
              onChange={setDraftEwt}
              placeholder="0.00"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Gross Amount is required. VAT, EWT and Net Amount are optional — if
            Net is left blank it defaults to Gross − VAT − EWT.
          </p>

          {/* ── SI / DR / CR / BS / OR References (numbers only) ── */}
          <div className="pt-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SI / DR / CR / BS / OR References
            </Label>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="SI Number"
                value={draftSiNo}
                onChange={setDraftSiNo}
                placeholder="e.g. SI-0001"
                uppercase
              />
              <Field
                label="OR Number"
                value={draftOrNo}
                onChange={setDraftOrNo}
                placeholder="e.g. OR-0001"
                uppercase
              />
              <Field
                label="DR Number"
                value={draftDrNo}
                onChange={setDraftDrNo}
                placeholder="e.g. DR-0001"
                uppercase
              />
              <Field
                label="CR Number"
                value={draftCrNo}
                onChange={setDraftCrNo}
                placeholder="e.g. CR-0001"
                uppercase
              />
              <Field
                label="BS Number"
                value={draftBsNo}
                onChange={setDraftBsNo}
                placeholder="e.g. BS-0001"
                uppercase
              />
              <Field
                label="Check No"
                value={draftCheckNo}
                onChange={setDraftCheckNo}
                placeholder="e.g. CHK-101"
                uppercase
              />
              <Field
                label="CV No"
                value={draftCvNo}
                onChange={setDraftCvNo}
                placeholder="e.g. CV-2026-001"
                uppercase
              />
            </div>
          </div>
{/* ── Receipt photo capture / upload ── */}
          <div className="space-y-1.5">
            <Label>Receipt Photo</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
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

            {draftPreviewSrc && (
              <div className="flex items-center gap-3 rounded-lg border p-2">
                {draftReceiptIsImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draftPreviewSrc}
                    alt="Receipt preview"
                    className="h-14 w-14 rounded border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded border text-muted-foreground">
                    <FileText className="h-6 w-6" />
                  </div>
                )}
                <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                  {draftReceiptName || "Receipt file"}
                </span>
                <div className="ml-auto flex gap-2">
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
{/* ── Receipt Items (pivot: Date | Description | <categories> | Total) ── */}
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
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={items.length === 0}
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
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
                    {sortedItems.map((item) => {
                      const originalIndex = items.indexOf(item);
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
                              {item.miscellaneousCode === cat
                                ? formatCurrency(item.amount)
                                : ""}
                            </TableCell>
                          ))}
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
                                  // eslint-disable-next-line @next/next/no-img-element
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
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totalAmount)}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                    <TableRow>
                      <TableCell
                        colSpan={displayCategories.length + 2}
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
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">Gross Amount</p>
                  <p className="font-bold">{formatCurrency(grossTotal)}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">VAT</p>
                  <p className="font-bold">{formatCurrency(vatTotal)}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">EWT</p>
                  <p className="font-bold">{formatCurrency(ewtTotal)}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">Net Amount</p>
                  <p className="font-bold">{formatCurrency(totalAmount)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
{/* ── Preview modal + off-screen printable document ── */}
      <LiquidationPreviewModalV2
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        controlNo={controlNo}
        fullName={resolvedFullName}
        items={items}
        categories={categories}
        miscLookup={miscLookup}
        onDownloadPdf={handleDownloadPdf}
        downloadingPdf={downloadingPdf}
        onDownloadImage={handleDownloadImage}
        downloadingImage={downloadingImage}
      />
      <div className="fixed -left-[9999px] top-0" aria-hidden="true">
        <LiquidationPrintDocumentV2
          controlNo={controlNo}
          fullName={resolvedFullName}
          items={items}
          categories={categories}
          miscLookup={miscLookup}
          id="liquidation-preview-content"
        />
      </div>

      {/* ── Sticky bottom submit bar ── */}
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
                Submit Liquidation V2
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
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
  Calculator,
  HelpCircle,
  HelpCircle as QuestionIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { liquidationService } from "@/lib/services/liquidation.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { userService } from "@/lib/services/user.service";
import { ftiService } from "@/lib/services/fti.service";
import type { FTIRequestSummary } from "@/types/fti";
import LiquidationPreviewModal from "@/components/liquidation-preview-modal";
import LiquidationPrintDocument, {
  type LiquidationFtiComparison,
} from "@/components/liquidation-print-document";
import type {
  LiquidationFull,
  ReceiptItemInput,
} from "@/types/liquidation";

const EDITABLE_STATUSES = ["SAVED", "REQUESTED_FOR_CHANGE"];

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
 * Reusable field input equipped with a large visual helper Dialog modal
 * to clearly display guide snippets from /public/guides/
 */
function FieldWithGuide({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  uppercase = false,
  subLabel,
  guideImagePath,
  guideTitle,
  guideDescription,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  uppercase?: boolean;
  subLabel?: string;
  guideImagePath?: string;
  guideTitle?: string;
  guideDescription?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">{label}</Label>

          {guideImagePath && (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
                >
                  <QuestionIcon className="h-3.5 w-3.5 text-blue-500" />
                  <span>Where to find?</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl w-[92vw] max-h-[88vh] flex flex-col p-6 z-50">
                <DialogHeader className="border-b pb-3">
                  <DialogTitle className="text-base font-semibold">
                    {guideTitle || `Finding "${label}" on Receipt`}
                  </DialogTitle>
                  {guideDescription && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {guideDescription}
                    </p>
                  )}
                </DialogHeader>

                <div className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-2 flex items-center justify-center my-2 min-h-[300px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={guideImagePath}
                    alt={`Sample snippet for ${label}`}
                    className="w-full h-auto object-contain max-h-[60vh] rounded"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      if (target.parentElement) {
                        target.parentElement.innerHTML = `<div class="p-8 text-center text-xs text-muted-foreground font-mono">Image snippet placeholder:<br/><span class="text-blue-600">${guideImagePath}</span><br/><br/>(Upload cropped snippet image to public/guides/ folder)</div>`;
                      }
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {subLabel && (
          <span className="text-[10px] text-muted-foreground font-normal">
            {subLabel}
          </span>
        )}
      </div>

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

export function LiquidationForm({
  userId,
  onCancel,
  editingLiquidation,
  restrictToOther = false,
  initialControlNo = "",
}: {
  userId: string;
  onCancel?: () => void;
  editingLiquidation?: LiquidationFull | null;
  restrictToOther?: boolean;
  /** When creating an FTI-linked liquidation via deep link, pre-select the FTI. */
  initialControlNo?: string;
}) {
  const isEditing = !!editingLiquidation;
  const isLocked =
    isEditing &&
    !EDITABLE_STATUSES.includes(
      (editingLiquidation?.status || "").toUpperCase(),
    );

  const [liquidationId, setLiquidationId] = useState(
    editingLiquidation?.liquidationId || "",
  );

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
    editingLiquidation?.controlNo || initialControlNo || "",
  );
  const [totalAmountRequested, setTotalAmountRequested] = useState(
    editingLiquidation && !editingLiquidation.controlNo
      ? editingLiquidation.totalAmountRequested != null
        ? String(editingLiquidation.totalAmountRequested)
        : ""
      : "",
  );

  const [items, setItems] = useState<ReceiptItemInput[]>(() =>
    editingLiquidation
      ? editingLiquidation.items.map((it) => ({
          date: it.date,
          description: it.description,
          category: it.category,
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

  const [supplierName, setSupplierName] = useState(
    editingLiquidation?.items[0]?.supplierName || "",
  );
  const [supplierAddress, setSupplierAddress] = useState(
    editingLiquidation?.items[0]?.address || "",
  );
  const [tin, setTin] = useState(editingLiquidation?.items[0]?.tin || "");
  const [refNo, setRefNo] = useState(editingLiquidation?.items[0]?.refNo || "");

  const [categories, setCategories] = useState<string[]>([]);
  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [resolvedFullName, setResolvedFullName] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFtiComparison, setPreviewFtiComparison] =
    useState<LiquidationFtiComparison | null>(null);

  // Load the linked FTI's fuel/toll/misc totals whenever the preview is open
  // so the printable document can show the FTI comparison row.
  useEffect(() => {
    if (!previewOpen || !controlNo) {
      setPreviewFtiComparison(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ftiFull = await ftiService.getRequest(controlNo);
        if (cancelled) return;
        const miscTotals = new Map<string, number>();
        for (const detail of ftiFull.details || []) {
          for (const expense of detail.expenses || []) {
            miscTotals.set(
              expense.miscCode,
              (miscTotals.get(expense.miscCode) || 0) + (expense.amount || 0),
            );
          }
        }
        setPreviewFtiComparison({
          fuel: (ftiFull.details || []).reduce(
            (sum, detail) => sum + (detail.fuelSubTotal || 0),
            0,
          ),
          toll: (ftiFull.details || []).reduce(
            (sum, detail) => sum + (detail.tollFee || 0),
            0,
          ),
          misc: Array.from(miscTotals.entries()).map(([code, amount]) => ({
            code,
            amount,
          })),
        });
      } catch {
        if (!cancelled) setPreviewFtiComparison(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOpen, controlNo]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successLiquidationId, setSuccessLiquidationId] = useState<
    string | null
  >(null);

  const [draftDate, setDraftDate] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftGross, setDraftGross] = useState("");
  const [draftEwt, setDraftEwt] = useState("");
  const [draftApplyVat, setDraftApplyVat] = useState(false);

  const [draftSiNo, setDraftSiNo] = useState("");
  const [draftDrNo, setDraftDrNo] = useState("");
  const [draftCrNo, setDraftCrNo] = useState("");
  const [draftBsNo, setDraftBsNo] = useState("");
  const [draftOrNo, setDraftOrNo] = useState("");
  const [draftCheckNo, setDraftCheckNo] = useState("");
  const [draftCvNo, setDraftCvNo] = useState("");
  const [draftRefNo, setDraftRefNo] = useState("");

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

  const getItemGross = (it: ReceiptItemInput) =>
    it.grossAmount ?? it.amount ?? 0;
  const totalAmount = items.reduce((sum, it) => sum + getItemGross(it), 0);

  const advances = isOther ? requestedAmount : selectedFti?.totalAmount || 0;
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
    ? Math.abs(difference)
    : !hasAdvances || difference === 0
      ? difference === 0
        ? 0
        : totalAmount
      : difference;

  const categoryTotals = Object.fromEntries(
    categories.map((cat) => [
      cat,
      items
        .filter((it) => it.category === cat)
        .reduce((s, it) => s + getItemGross(it), 0),
    ]),
  );

  const displayCategories = categories.filter((cat) => categoryTotals[cat] > 0);
  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

  const draftGrossNum = parseFloat(draftGross);
  const draftEwtNum = parseFloat(draftEwt);
  const hasGrossInput =
    draftGross !== "" && !isNaN(draftGrossNum) && draftGrossNum >= 0;
  const draftVat =
    hasGrossInput && draftApplyVat
      ? Math.round((draftGrossNum / 1.12) * 0.12 * 100) / 100
      : 0;
  const draftEwtValue =
    draftEwt !== "" && !isNaN(draftEwtNum) && draftEwtNum > 0
      ? Math.round(draftEwtNum * 100) / 100
      : 0;
  const draftNet = hasGrossInput
    ? Math.max(
        0,
        Math.round((draftGrossNum - draftVat - draftEwtValue) * 100) / 100,
      )
    : 0;
  const draftVatText = hasGrossInput ? draftVat.toFixed(2) : "";
  const draftNetText = hasGrossInput ? draftNet.toFixed(2) : "";

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

  // Restore existing receipts when an FTI ControlNo is selected
  useEffect(() => {
    let cancelled = false;
    if (!controlNo || isEditing || liqType !== "fti") return;
    (async () => {
      try {
        const existing = await liquidationService.getByControlNo(controlNo);
        if (!cancelled && existing) {
          setLiquidationId(existing.liquidationId);
          setItems(
            existing.items.map((it) => ({
              date: it.date,
              description: it.description,
              category: it.category,
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
            })),
          );
        }
      } catch (err) {
        console.error("Failed to restore existing liquidation by ControlNo:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controlNo, isEditing, liqType]);

  const handleTypeChange = (linkedToFti: boolean) => {
    if (restrictToOther || isEditing || isLocked) return;
    if (linkedToFti) {
      setLiqType("fti");
      setLiquidationId("");
      setItems([]);
      setTotalAmountRequested("");
    } else {
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
    setDraftEwt("");
    setDraftApplyVat(false);
    setDraftSiNo("");
    setDraftDrNo("");
    setDraftCrNo("");
    setDraftBsNo("");
    setDraftOrNo("");
    setDraftCheckNo("");
    setDraftCvNo("");
    setDraftRefNo("");
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

    const vat = draftApplyVat
      ? Math.round((gross / 1.12) * 0.12 * 100) / 100
      : 0;
    const ewt = draftEwtValue;
    const net = Math.max(0, Math.round((gross - vat - ewt) * 100) / 100);

    let finalReceiptUrl = draftReceiptUrl;
    let finalReceiptPreviewUrl = draftReceiptPreviewUrl;
    let uploadedFileId = "";

    if (draftReceiptFile && !draftReceiptUrl) {
      setUploading(true);
      try {
        const result =
          await liquidationService.uploadReceipt(draftReceiptFile);
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

    const miscDescription = miscLookup.get(draftCategory) || draftCategory;

    const item: ReceiptItemInput = {
      date: draftDate,
      description: draftDescription.trim().toUpperCase(),
      category: draftCategory,
      amount: net,
      grossAmount: gross,
      vat: vat > 0 ? vat : undefined,
      ewt: ewt > 0 ? ewt : undefined,
      particulars: miscDescription,
      siNumber: draftSiNo.trim().toUpperCase() || undefined,
      drNumber: draftDrNo.trim().toUpperCase() || undefined,
      crNumber: draftCrNo.trim().toUpperCase() || undefined,
      bsNumber: draftBsNo.trim().toUpperCase() || undefined,
      orNumber: draftOrNo.trim().toUpperCase() || undefined,
      checkNo: draftCheckNo.trim().toUpperCase() || undefined,
      cvNo: draftCvNo.trim().toUpperCase() || undefined,
      refNo: draftRefNo.trim().toUpperCase() || refNo || undefined,
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
        await liquidationService.replace(liquidationId, updated);
        setItems(updated);
        toast.success("Receipt item updated.");
        resetDraft();
      } else {
        let activeId = liquidationId;
        if (!activeId) {
          const draft = await liquidationService.createDraft(
            controlNo,
            isOther ? requestedAmount : undefined,
          );
          activeId = draft.liquidationId;
          setLiquidationId(activeId);
        }
        await liquidationService.addItem(activeId, [item]);
        setItems((prev) => [...prev, item]);
        toast.success("Receipt item added.");
        resetDraft();
        setSupplierName("");
        setSupplierAddress("");
        setTin("");
        setRefNo("");
      }
    } catch (error) {
      console.error("Failed to persist receipt item:", error);
      if (uploadedFileId) {
        try {
          await liquidationService.deleteReceipt(uploadedFileId);
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
    setDraftCategory(it.category);
    setDraftDescription(it.description);
    setDraftGross(it.grossAmount != null ? String(it.grossAmount) : "");
    setDraftEwt(it.ewt != null ? String(it.ewt) : "");
    setDraftApplyVat(it.vat != null && it.vat > 0);
    setDraftSiNo(it.siNumber || "");
    setDraftDrNo(it.drNumber || "");
    setDraftCrNo(it.crNumber || "");
    setDraftBsNo(it.bsNumber || "");
    setDraftOrNo(it.orNumber || "");
    setDraftCheckNo(it.checkNo || "");
    setDraftCvNo(it.cvNo || "");
    setDraftRefNo(it.refNo || "");
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
      await liquidationService.replace(liquidationId, remaining);
      setItems(remaining);
      toast.success("Receipt item removed.");
    } catch (error) {
      console.error("Failed to remove receipt item:", error);
      toast.error("Failed to remove receipt item. Please try again.");
    } finally {
      setUploading(false);
    }
  };

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
    if (isOther && totalAmountRequested === "") {
      toast.error("Please enter the Total Amount Requested.");
      return;
    }
    if (liquidationId) {
      const parsed = parseFloat(totalAmountRequested);
      if (isOther && !isNaN(parsed) && parsed >= 0) {
        try {
          await liquidationService.updateRequestedAmount(
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
      const result = await liquidationService.submit(liquidationId);
      toast.success(`Liquidation submitted! ID: ${result.liquidationId}`);
      setSuccessLiquidationId(result.liquidationId);
    } catch (error) {
      console.error("Liquidation submit failed:", error);
      toast.error("Failed to submit liquidation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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

  const isImageUrl = (url: string) =>
    /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(url) &&
    !url.includes("drive.google.com");

  if (successLiquidationId) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-4 px-5 py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <CardTitle className="text-2xl">Liquidation Submitted!</CardTitle>
          <p className="text-muted-foreground">
            Your expense liquidation was successfully recorded.
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
      {/* ── Liquidation Type ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Liquidation Type</CardTitle>
          <CardDescription>
            {restrictToOther
              ? "Create an expense liquidation without an FTI ControlNo."
              : isEditing
                ? "Edit the receipts and details for this liquidation."
                : 'Link to an APPROVED FTI, or create a "No FTI" liquidation.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {!restrictToOther && !isEditing && (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <Switch
                    id="liq-type-switch"
                    checked={liqType === "fti"}
                    onCheckedChange={handleTypeChange}
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="liq-type-switch"
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
                <FieldWithGuide
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

      {/* ── Vendor Information ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vendor Information</CardTitle>
          <CardDescription>
            Entered once and stamped on every receipt item you add.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldWithGuide
            label="Supplier Name"
            value={supplierName}
            onChange={setSupplierName}
            placeholder="E.G. SHELL GAS STATION"
            uppercase
            guideImagePath="/guides/supplier-name.png"
            guideTitle="1. Supplier / Store Name"
            guideDescription="Usually prominently printed at the topmost header of the receipt or invoice."
          />
          <FieldWithGuide
            label="Supplier Address"
            value={supplierAddress}
            onChange={setSupplierAddress}
            placeholder="E.G. BRGY. BANAY BANAY, CABUYAO CITY, LAGUNA"
            uppercase
            guideImagePath="/guides/supplier-address.png"
            guideTitle="2. Supplier Business Address"
            guideDescription="Located directly below the supplier/store name."
          />
          <FieldWithGuide
            label="TIN"
            value={tin}
            onChange={setTin}
            placeholder="E.G. 000-000-000-000"
            uppercase
            guideImagePath="/guides/tin.png"
            guideTitle="3. Tax Identification Number (TIN)"
            guideDescription="Look for 'VAT REG TIN', 'NON-VAT REG TIN', or 'TIN:' near the top header."
          />
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
          <FieldWithGuide
            label="Date"
            type="date"
            value={draftDate}
            onChange={setDraftDate}
            guideImagePath="/guides/receipt-date.png"
            guideTitle="4. Transaction Date"
            guideDescription="Look for 'Date:' or transaction timestamp on the receipt."
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

          <FieldWithGuide
            label="Description"
            value={draftDescription}
            onChange={setDraftDescription}
            placeholder="E.G. LUNCH DURING FIELD SERVICE"
            uppercase
            guideImagePath="/guides/description.png"
            guideTitle="Item Particulars / Description"
            guideDescription="Specific itemized descriptions or reason for the expense."
          />

          <FieldWithGuide
            label="Gross Amount (₱)"
            type="number"
            value={draftGross}
            onChange={setDraftGross}
            placeholder="0.00"
            guideImagePath="/guides/gross-amount.png"
            guideTitle="5. Total Gross Amount"
            guideDescription="Look for 'TOTAL', 'AMOUNT DUE', or 'TOTAL AMOUNT' at the bottom of the receipt."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Net Amount (₱) — auto</Label>
              <Input
                type="number"
                value={draftNetText}
                disabled
                readOnly
                placeholder="0.00"
                className="h-11 text-base bg-muted text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label>VAT (₱) — auto</Label>
              <Input
                type="number"
                value={draftVatText}
                disabled
                readOnly
                placeholder="0.00"
                className="h-11 text-base bg-muted text-muted-foreground"
              />
            </div>
            <FieldWithGuide
              label="EWT (₱) — optional"
              type="number"
              value={draftEwt}
              onChange={setDraftEwt}
              placeholder="0.00"
            />
          </div>

          {/* ── VAT trigger ── */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border bg-muted/40 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">
                {draftApplyVat
                  ? "VAT 12% applied to this receipt"
                  : "Non-VAT / VAT not applied"}
              </p>
              <p className="text-xs text-muted-foreground">
                Press the button only for VATable receipts. VAT = Gross ÷ 1.12 ×
                12%; Net = Gross − VAT − EWT.
              </p>
            </div>
            <Button
              type="button"
              variant={draftApplyVat ? "default" : "outline"}
              size="sm"
              className={
                draftApplyVat ? "bg-blue-600 hover:bg-blue-700 text-white" : ""
              }
              onClick={() => setDraftApplyVat((prev) => !prev)}
            >
              <Calculator className="mr-2 h-4 w-4" />
              {draftApplyVat ? "Remove VAT" : "Apply VAT 12%"}
            </Button>
          </div>

          {/* ── FOOLPROOF DOCUMENT REFERENCES SECTION ── */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Document References
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Fill in the reference field that matches your receipt or
                  document.
                </p>
              </div>

              {/* Reference Guide Tooltip */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      <span>Reference Guide</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="left"
                    className="max-w-xs text-xs space-y-1"
                  >
                    <p className="font-semibold border-b pb-1">
                      Which field should I use?
                    </p>
                    <p>
                      <strong>SI:</strong> Sales Invoice (Goods/Items)
                    </p>
                    <p>
                      <strong>OR:</strong> Official Receipt (Services/Utilities)
                    </p>
                    <p>
                      <strong>DR:</strong> Delivery Receipt
                    </p>
                    <p>
                      <strong>CR:</strong> Collection Receipt
                    </p>
                    <p>
                      <strong>BS:</strong> Billing Statement
                    </p>
                    <p>
                      <strong>Check / CV:</strong> Payment Voucher & Check
                      details
                    </p>
                    <p className="pt-1 text-amber-600 font-medium">
                      <strong>Ref No:</strong> Use ONLY if none of the above
                      apply (e.g. Waybill, Statement of Account).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* 6. SI Number */}
              <FieldWithGuide
                label="SI Number"
                subLabel="Sales Invoice"
                value={draftSiNo}
                onChange={setDraftSiNo}
                placeholder="E.G. SI-0001"
                uppercase
                guideImagePath="/guides/si-number.png"
                guideTitle="6. Sales Invoice Number (S.I. #)"
                guideDescription="Look for 'S.I. #', 'SI NO.', or 'SALES INVOICE #' printed on the receipt."
              />

              {/* 7. OR Number */}
              <FieldWithGuide
                label="OR Number"
                subLabel="Official Receipt"
                value={draftOrNo}
                onChange={setDraftOrNo}
                placeholder="E.G. OR-0001"
                uppercase
                guideImagePath="/guides/or-number.png"
                guideTitle="7. Official Receipt Number (O.R. #)"
                guideDescription="Look for 'O.R. #', 'OR NO.', or 'OFFICIAL RECEIPT NO.'."
              />

              {/* 8. DR Number */}
              <FieldWithGuide
                label="DR Number"
                subLabel="Delivery Receipt"
                value={draftDrNo}
                onChange={setDraftDrNo}
                placeholder="E.G. DR-0001"
                uppercase
                guideImagePath="/guides/dr-number.png"
                guideTitle="8. Delivery Receipt Number (D.R. #)"
                guideDescription="Look for 'D.R. #', 'DR NO.', or 'DELIVERY RECEIPT'."
              />

              {/* 9. CR Number */}
              <FieldWithGuide
                label="CR Number"
                subLabel="Collection Receipt"
                value={draftCrNo}
                onChange={setDraftCrNo}
                placeholder="E.G. CR-0001"
                uppercase
                guideImagePath="/guides/cr-number.png"
                guideTitle="9. Collection Receipt Number (C.R. #)"
                guideDescription="Look for 'C.R. #', 'CR NO.', or 'COLLECTION RECEIPT'."
              />

              {/* 10. BS Number */}
              <FieldWithGuide
                label="BS Number"
                subLabel="Billing Statement"
                value={draftBsNo}
                onChange={setDraftBsNo}
                placeholder="E.G. BS-0001"
                uppercase
                guideImagePath="/guides/bs-number.png"
                guideTitle="10. Billing Statement Number (B.S. #)"
                guideDescription="Look for 'STATEMENT NO.', 'BILLING NO.', or 'B.S. #'."
              />

              {/* 11. Check No */}
              <FieldWithGuide
                label="Check No"
                subLabel="Check Payment"
                value={draftCheckNo}
                onChange={setDraftCheckNo}
                placeholder="E.G. CHK-101"
                uppercase
                guideImagePath="/guides/check-number.png"
                guideTitle="11. Check Number"
                guideDescription="Check number issued or indicated on check payment vouchers."
              />

              {/* 12. CV No */}
              <FieldWithGuide
                label="CV No"
                subLabel="Check Voucher"
                value={draftCvNo}
                onChange={setDraftCvNo}
                placeholder="E.G. CV-2026-001"
                uppercase
                guideImagePath="/guides/cv-number.png"
                guideTitle="12. Check Voucher Number (C.V. #)"
                guideDescription="Look for 'CHECK VOUCHER NO.' or 'C.V. #' on company vouchers."
              />

              {/* Ref No placed directly beside CV No (spans 2 columns on lg screens) */}
              <div className="lg:col-span-2">
                <FieldWithGuide
                  label="Ref No (Other / Fallback)"
                  subLabel="Use ONLY if no standard reference applies"
                  value={draftRefNo}
                  onChange={setDraftRefNo}
                  placeholder="E.G. STATEMENT OF ACCOUNT, ORDER SLIP, AIR WAYBILL"
                  uppercase
                  guideImagePath="/guides/ref-number.png"
                  guideTitle="Other Document Reference"
                  guideDescription="Use for Air Waybills, GCash Ref #, Statement of Accounts, or Order Slips."
                />
              </div>
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

      {/* ── Receipt Items Pivot Table ── */}
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
                      const itemGross = item.grossAmount ?? item.amount ?? 0;
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
                                ? formatCurrency(itemGross)
                                : ""}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            {formatCurrency(itemGross)}
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
        fti={previewFtiComparison}
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
          fti={previewFtiComparison}
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
                Submit Liquidation
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
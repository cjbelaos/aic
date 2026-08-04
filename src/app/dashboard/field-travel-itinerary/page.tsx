"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  FileX,
  Pencil,
  ArrowUpDown,
  Save,
  Send,
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { format } from "date-fns";
import FTIPreviewModal from "@/components/fti-preview-modal";
import FTIPrintDocument from "@/components/fti-print-document";
import type { DraftItinerary } from "@/components/fti-print-document";
import { EntityTable } from "@/components/ui/entity-table";
import ftiService from "@/lib/services/fti.service";
import { userApproverService } from "@/lib/services/userApprover.service";
import { userService } from "@/lib/services/user.service";
import type { UserApprover } from "@/types/userApprover";

import {
  FTIRequestSummary,
  FTIRequestFull,
  isEditableStatus,
  computeFuelCost,
  computeDetailTotal,
} from "@/types/fti";
import { ColumnDef } from "@tanstack/react-table";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ExpresswaySegment {
  id: string;
  group: string;
  entry: string;
  exit: string;
  tollFee: number;
}

interface Destination {
  id: string;
  name: string;
  address?: string;
  segments: ExpresswaySegment[];
  distanceKm?: number;
}

interface FormData {
  ftiRef: string;
  technician: string;
  date: string;
  origin: string;
  itinerary: string;
  description: string;
  miscellaneous: string;
  amount: string;
  fuelPrice: string;
}

interface LocationItem {
  companyName: string;
  address: string;
}

interface ExpresswayGroup {
  name: string;
  gates: string[];
}

interface FormInfo {
  technicians: string[];
  miscellaneous: string[];
  miscellaneousFull: { code: string; description: string }[];
  tollGates: string[];
  locations: LocationItem[];
  expresswayGroups: ExpresswayGroup[];
  currentUserFullName: string;
  currentUserUsername: string;
  currentUserId: string;
  isAdmin: boolean;
  users: { userId: string; fullName: string }[];
  ftiRef: string;
  kmPerLiter: number;
}

const STATUS_OPTIONS = [
  "ALL",
  "DRAFT",
  "SENT",
  "APPROVED",
  "REQUESTED_FOR_CHANGE",
  "REJECTED",
] as const;

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

function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── localStorage keys ─────────────────────────
const LS_BATCH_ITEMS = "fti_draft_items";
const LS_ACTIVE_REF = "fti_active_ref";

type ViewMode = "list" | "create" | "edit" | "view";

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function FieldTravelItineraryPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ftiRequests, setFtiRequests] = useState<FTIRequestSummary[]>([]);
  const [formInfo, setFormInfo] = useState<FormInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [formData, setFormData] = useState<FormData>({
    ftiRef: "",
    technician: "",
    date: format(new Date(), "yyyy-MM-dd"),
    origin: "AERICH INNOVATION CORP.",
    itinerary: "",
    description: "",
    miscellaneous: "",
    amount: "",
    fuelPrice: "",
  });
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [totalKm, setTotalKm] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<string>("");
  const addressMapRef = useRef<Record<string, string>>({});

  // ── Batch state ──────────────────────────────
  const [batchItems, setBatchItems] = useState<DraftItinerary[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // ── View mode & list state ───────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [deleteTarget, setDeleteTarget] = useState<FTIRequestSummary | null>(
    null,
  );
  const [viewRequest, setViewRequest] = useState<FTIRequestFull | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("SAVED");
  const [requestDateCreated, setRequestDateCreated] = useState("");
  const [approvalInProgress, setApprovalInProgress] = useState(false);
  const [approvers, setApprovers] = useState<UserApprover[]>([]);
  const [approvedBy, setApprovedBy] = useState("");
  const [approvedBySignatureUrl, setApprovedBySignatureUrl] = useState("");

  const loadFTIRequests = useCallback(async () => {
    try {
      setListLoading(true);

      // Fetch both requests and user-approver mappings in parallel
      const [requests, approverList] = await Promise.all([
        ftiService.getRequests(),
        userApproverService.getAll().catch(() => []), // Gracefully handle if route errors
      ]);

      setFtiRequests(requests);
      setApprovers(approverList);
    } catch {
      toast.error("Failed to load FTI requests.");
    } finally {
      setListLoading(false);
    }
  }, [formInfo?.isAdmin]);

  const loadFormInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/fti/info");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const tollGates = data.tollMatrix?.gates || data.tollGates || [];
      setFormInfo({
        technicians: data.technicians || [],
        miscellaneous: data.miscellaneous || [],
        miscellaneousFull: data.miscellaneousFull || [],
        tollGates,
        locations: data.locations || [],
        expresswayGroups: data.expresswayGroups || [],
        currentUserFullName: data.currentUserFullName || "",
        currentUserUsername: data.currentUserUsername || "",
        currentUserId: data.currentUserId || "",
        isAdmin: data.isAdmin === true,
        users: data.users || [],
        ftiRef: data.ftiRef,
        kmPerLiter: data.kmPerLiter || 12,
      });
      const map: Record<string, string> = {};
      (data.locations || []).forEach((loc: LocationItem) => {
        map[loc.companyName] = loc.address || loc.companyName;
      });
      addressMapRef.current = map;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load form data",
      );
    }
  }, []);

  useEffect(() => {
    loadFormInfo();
  }, [loadFormInfo]);

  useEffect(() => {
    if (formInfo) {
      loadFTIRequests();
      setLoading(false);
    }
  }, [formInfo, loadFTIRequests]);

  // ── Calculate distance ─────────────────────────
  const calculateDistance = useCallback(
    async (origin: string, legs: Destination[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!origin || legs.length === 0) {
        setTotalKm(null);
        setDestinations((prev) =>
          prev.map((d) => ({ ...d, distanceKm: undefined })),
        );
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsCalculating(true);
        const originAddress = addressMapRef.current[origin] || origin;
        const payload = {
          origin: originAddress,
          legs: legs.map((l) => ({
            destination: addressMapRef.current[l.name] || l.name,
          })),
        };
        const payloadKey = JSON.stringify(payload);
        if (payloadKey === lastPayloadRef.current) {
          setIsCalculating(false);
          return;
        }
        lastPayloadRef.current = payloadKey;
        try {
          const res = await fetch("/api/calculate-distance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await res.json();
          const responseData =
            result.status === "success" && result.data ? result.data : result;
          if (responseData && typeof responseData.totalKm === "number") {
            setTotalKm(responseData.totalKm);
            if (Array.isArray(responseData.legDistances)) {
              setDestinations((prev) =>
                prev.map((d, idx) => {
                  const leg = responseData.legDistances.find(
                    (l: { legIndex: number; distanceKm: number }) =>
                      l.legIndex === idx,
                  );
                  return { ...d, distanceKm: leg?.distanceKm ?? undefined };
                }),
              );
            }
          } else {
            setTotalKm(null);
            setDestinations((prev) =>
              prev.map((d) => ({ ...d, distanceKm: undefined })),
            );
          }
        } catch {
          setTotalKm(null);
          setDestinations((prev) =>
            prev.map((d) => ({ ...d, distanceKm: undefined })),
          );
        } finally {
          setIsCalculating(false);
        }
      }, 600);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Helper to create empty segment
  const createEmptySegment = (): ExpresswaySegment => ({
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    group: "",
    entry: "",
    exit: "",
    tollFee: 0,
  });

  const createEmptyDestination = (): Destination => ({
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    name: "",
    segments: [],
    distanceKm: undefined,
  });

  const handleAddDestination = () => {
    setDestinations((prev) => [...prev, createEmptyDestination()]);
  };

  const handleRemoveDestination = (id: string) => {
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  };

  const handleDestinationNameChange = (id: string, value: string) => {
    setDestinations((prev) => {
      if (value === formData.origin && prev.length === 2) {
        const otherDest = prev.find((d) => d.id !== id);
        if (otherDest && otherDest.segments.length > 0) {
          const mirroredSegments = [...otherDest.segments]
            .reverse()
            .map((seg) => ({
              id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
              group: seg.group,
              entry: seg.exit,
              exit: seg.entry,
              tollFee: seg.tollFee,
            }));
          return prev.map((d) =>
            d.id === id ? { ...d, name: value, segments: mirroredSegments } : d,
          );
        }
      }
      return prev.map((d) => (d.id === id ? { ...d, name: value } : d));
    });
  };

  const handleAddSegment = (destId: string) => {
    setDestinations((prev) =>
      prev.map((d) =>
        d.id === destId
          ? { ...d, segments: [...d.segments, createEmptySegment()] }
          : d,
      ),
    );
  };

  const handleRemoveSegment = (destId: string, segId: string) => {
    setDestinations((prev) =>
      prev.map((d) =>
        d.id === destId
          ? { ...d, segments: d.segments.filter((s) => s.id !== segId) }
          : d,
      ),
    );
  };

  const handleSegmentChange = (
    destId: string,
    segId: string,
    field: keyof ExpresswaySegment,
    value: string,
  ) => {
    setDestinations((prev) =>
      prev.map((d) =>
        d.id === destId
          ? {
              ...d,
              segments: d.segments.map((s) =>
                s.id === segId ? { ...s, [field]: value } : s,
              ),
            }
          : d,
      ),
    );
  };

  const handleSegmentTollLookup = useCallback(
    async (destId: string, segId: string, entry: string, exit: string) => {
      if (!entry || !exit) {
        setDestinations((prev) =>
          prev.map((d) =>
            d.id === destId
              ? {
                  ...d,
                  segments: d.segments.map((s) =>
                    s.id === segId ? { ...s, tollFee: 0 } : s,
                  ),
                }
              : d,
          ),
        );
        return;
      }
      try {
        const res = await fetch("/api/fti/lookup-toll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry, exit }),
        });
        const data = await res.json();
        if (res.ok) {
          setDestinations((prev) =>
            prev.map((d) =>
              d.id === destId
                ? {
                    ...d,
                    segments: d.segments.map((s) =>
                      s.id === segId ? { ...s, tollFee: data.fee } : s,
                    ),
                  }
                : d,
            ),
          );
        }
      } catch {
        // silently fail
      }
    },
    [],
  );

  useEffect(() => {
    if (formData.origin && destinations.length > 0) {
      calculateDistance(formData.origin, destinations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.origin, destinations]);

  const totalTollFee = destinations.reduce(
    (sum, d) => sum + d.segments.reduce((s, seg) => s + seg.tollFee, 0),
    0,
  );

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "itinerary" || field === "description") {
        updated[field] = value.toUpperCase();
      }
      return updated;
    });
  };

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      handleFieldChange("date", format(date, "yyyy-MM-dd"));
    }
  };

  // User's KmPerLiter from UserFuelPerKm sheet (defaults to 12)
  const kmPerLiter = formInfo?.kmPerLiter ?? 12;

  // ── Add to batch ──────────────────────────────
  const handleAddToBatch = () => {
    if (!formData.date || !formData.itinerary) {
      toast.error("Please fill in required fields: Itinerary, Description");
      return;
    }
    if (!formData.description) {
      toast.error("Description is required.");
      return;
    }
    if (!formData.origin) {
      toast.error("Please select an origin.");
      return;
    }
    if (destinations.length === 0 || !destinations.some((d) => d.name)) {
      toast.error("Please add at least one destination with a name.");
      return;
    }
    if (isCalculating) {
      toast.error("Please wait — leg distance is still being calculated.");
      return;
    }
    if (!formData.fuelPrice || parseFloat(formData.fuelPrice) <= 0) {
      toast.error("Fuel Price is required.");
      return;
    }
    for (const dest of destinations) {
      if (typeof dest.distanceKm !== "number" || dest.distanceKm <= 0) {
        toast.error(`Leg distance is required for "${dest.name}".`);
        return;
      }
      const legToll = dest.segments.reduce(
        (s, seg) => s + (seg.tollFee || 0),
        0,
      );
      if (legToll <= 0) {
        toast.error(`Toll fee is required for leg "${dest.name}".`);
        return;
      }
    }
    if (totalTollFee <= 0) {
      toast.error(
        "Total toll fee is required before adding the itinerary row.",
      );
      return;
    }

    const km = totalKm ?? 0;
    const tollFee = totalTollFee;
    const miscAmount = parseFloat(formData.amount) || 0;
    const fuelPrice = parseFloat(formData.fuelPrice) || 0;
    const fuelAmount = computeFuelCost(km, fuelPrice, kmPerLiter);
    const totalAmount = parseFloat(
      (fuelAmount + tollFee + miscAmount).toFixed(2),
    );

    const newItem: DraftItinerary = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      date: formData.date,
      itinerary: formData.itinerary,
      description: formData.description,
      km: parseFloat(km.toFixed(2)),
      fuelPrice,
      tollFee,
      miscellaneous: formData.miscellaneous,
      miscellaneousDescription:
        formInfo?.miscellaneousFull.find(
          (m) => m.code === formData.miscellaneous,
        )?.description || "",
      miscAmount,
      fuelAmount,
      totalAmount,
      origin: formData.origin,
      originAddress: addressMapRef.current[formData.origin] || "",
      destinations: destinations.map((d) => ({
        id: d.id,
        name: d.name,
        address: addressMapRef.current[d.name] || "",
        distanceKm: d.distanceKm,
        segments: d.segments.map((s) => ({
          id: s.id,
          group: s.group,
          entry: s.entry,
          exit: s.exit,
          tollFee: s.tollFee,
        })),
      })),
    };

    if (editingItemId) {
      setBatchItems((prev) =>
        prev.map((item) => (item.id === editingItemId ? newItem : item)),
      );
      setEditingItemId(null);
      toast.success("Itinerary updated in batch.");
    } else {
      setBatchItems((prev) => [...prev, newItem]);
      toast.success("Itinerary added to list.");
    }

    setDestinations([]);
    setTotalKm(null);
    setFormData((prev) => ({
      ...prev,
      date: format(new Date(), "yyyy-MM-dd"),
      origin: "",
      itinerary: "",
      description: "",
      miscellaneous: "",
      amount: "",
    }));
    setSelectedDate(new Date());
  };

  // ── Edit batch item ───────────────────────────
  const handleEditBatchItem = (item: DraftItinerary) => {
    lastPayloadRef.current = "";
    setFormData((prev) => ({
      ...prev,
      date: item.date,
      origin: item.origin || "AERICH INNOVATION CORP.",
      itinerary: item.itinerary,
      description: item.description,
      miscellaneous: item.miscellaneous || "",
      amount: item.miscAmount ? item.miscAmount.toString() : "",
      fuelPrice: item.fuelPrice ? item.fuelPrice.toString() : "",
    }));
    if (item.date) {
      try {
        const parsedDate = new Date(item.date);
        if (!isNaN(parsedDate.getTime())) setSelectedDate(parsedDate);
      } catch {}
    }
    if (typeof item.km === "number" && !isNaN(item.km)) setTotalKm(item.km);
    if (Array.isArray(item.destinations) && item.destinations.length > 0) {
      setDestinations(
        item.destinations.map((d) => ({
          id:
            d.id ||
            crypto.randomUUID?.() ||
            Math.random().toString(36).slice(2),
          name: d.name,
          segments: Array.isArray(d.segments)
            ? d.segments.map((s) => ({
                id:
                  s.id ||
                  crypto.randomUUID?.() ||
                  Math.random().toString(36).slice(2),
                group: s.group,
                entry: s.entry,
                exit: s.exit,
                tollFee: s.tollFee || 0,
              }))
            : [],
          distanceKm: d.distanceKm,
        })),
      );
    } else {
      setDestinations([]);
    }
    setEditingItemId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info(
      "Editing itinerary. Update fields and click 'Update Itinerary in List' to save.",
    );
  };

  const handleRemoveBatchItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
    if (editingItemId === id) setEditingItemId(null);
  };

  const handleClearDraft = () => {
    setBatchItems([]);
    setEditingItemId(null);
    try {
      localStorage.removeItem(LS_BATCH_ITEMS);
      localStorage.removeItem(LS_ACTIVE_REF);
    } catch {}
    toast.success("Draft cleared.");
  };

  const generateNewRef = useCallback(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `CTRL-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }, []);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      // html2canvas-pro handles Tailwind v4's oklch() colors (html2canvas can't).
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");
      const element = document.getElementById("fti-preview-content");
      if (!element) {
        toast.error("Preview content not found.");
        return;
      }
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "in",
        format: "letter",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 0.5;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const totalPages = Math.ceil((imgHeight + margin * 2) / pageHeight);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        const srcY = page * (element.scrollHeight / totalPages);
        // Slice the canvas per page for reliable multi-page output
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(
          canvas.height - srcY * (canvas.height / element.scrollHeight),
          (canvas.height * (pageHeight - margin * 2)) / imgWidth,
        );
        const ctx = sliceCanvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          srcY * (canvas.height / element.scrollHeight),
          sliceCanvas.width,
          sliceCanvas.height,
          0,
          0,
          sliceCanvas.width,
          sliceCanvas.height,
        );
        pdf.addImage(
          sliceCanvas.toDataURL("image/jpeg", 0.98),
          "JPEG",
          margin,
          margin,
          imgWidth,
          (sliceCanvas.height * imgWidth) / sliceCanvas.width,
        );
      }

      pdf.save(`FTI_${formData.ftiRef}.pdf`);
      toast.success("PDF downloaded successfully.");
    } catch {
      toast.error("Failed to generate PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const mapBatchToDetails = useCallback(() => {
    return batchItems.map((item) => {
      const formSegments = item.destinations || [];
      return {
        date: item.date,
        itinerary: item.itinerary,
        description: item.description,
        km: item.km,
        fuelPrice: item.fuelPrice,
        tollFee: item.tollFee,
        expenses: item.miscellaneous
          ? [{ miscCode: item.miscellaneous, amount: item.miscAmount }]
          : [],
        legs: formSegments.map((dest, index) => ({
          originName: index === 0 ? item.origin : formSegments[index - 1].name,
          originAddress:
            index === 0
              ? item.originAddress || ""
              : formSegments[index - 1].address || "",
          destName: dest.name,
          destAddress: dest.address || "",
          tollFee: dest.segments.reduce((s, seg) => s + seg.tollFee, 0),
          distanceKm: dest.distanceKm || 0,
          segments: (dest.segments || []).map((seg) => ({
            group: seg.group,
            entry: seg.entry,
            exit: seg.exit,
            tollFee: seg.tollFee || 0,
          })),
        })),
      };
    });
  }, [batchItems]);

  const generatePdfBlob = async (): Promise<Blob> => {
    // html2canvas-pro handles Tailwind v4's oklch() colors (html2canvas can't).
    const html2canvas = (await import("html2canvas-pro")).default;
    const { jsPDF } = await import("jspdf");
    // Prefer the preview element when the modal is open, otherwise use the
    // hidden FTIPrintDocument (id="fti-print-content") so Submit Request
    // works without opening Preview.
    const element =
      document.getElementById("fti-preview-content") ||
      document.getElementById("fti-print-content");
    if (!element) {
      throw new Error("FTI print document not found.");
    }
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: "letter",
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 0.5;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const totalPages = Math.ceil((imgHeight + margin * 2) / pageHeight);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();
      const srcY = page * (element.scrollHeight / totalPages);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.min(
        canvas.height - srcY * (canvas.height / element.scrollHeight),
        (canvas.height * (pageHeight - margin * 2)) / imgWidth,
      );
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        srcY * (canvas.height / element.scrollHeight),
        sliceCanvas.width,
        sliceCanvas.height,
        0,
        0,
        sliceCanvas.width,
        sliceCanvas.height,
      );
      pdf.addImage(
        sliceCanvas.toDataURL("image/jpeg", 0.98),
        "JPEG",
        margin,
        margin,
        imgWidth,
        (sliceCanvas.height * imgWidth) / sliceCanvas.width,
      );
    }

    return pdf.output("blob");
  };

  const saveGdToGoogleDrive = async (
    blob: Blob,
    ref?: string,
  ): Promise<string> => {
    const refValue = ref || formData.ftiRef;
    if (!refValue) throw new Error("NO FTI Reference provided.");
    const fd = new FormData();
    fd.append("pdf", blob, "FTI_" + refValue + ".pdf");
    fd.append("ftiRef", refValue);
    const res = await fetch("/api/fti/save-pdf-to-drive", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      let detail = `Failed to save PDF to Google Drive (${res.status}).`;
      try {
        const data = await res.json();
        if (data?.error) detail = data.error;
      } catch {
        // keep generic
      }
      throw new Error(detail);
    }
    const data = await res.json();
    return data.fileLink || "";
  };

  const handleSaveRequest = async (submitStatus: "DRAFT" | "SENT") => {
    if (batchItems.length === 0) {
      toast.error("Add at least one itinerary row before saving.");
      return;
    }
    setBatchSubmitting(true);
    try {
      await ftiService.updateRequest(formData.ftiRef, {
        status: submitStatus,
        details: mapBatchToDetails(),
      });
      toast.success(
        submitStatus === "SENT"
          ? `FTI ${formData.ftiRef} sent successfully.`
          : `FTI ${formData.ftiRef} saved as draft.`,
      );
      setBatchItems([]);
      setEditingItemId(null);
      setPreviewOpen(false);
      setViewMode("list");
      await loadFTIRequests();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save FTI request",
      );
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    await handleSaveRequest("DRAFT");
  };

  const handleSubmitRequest = async () => {
    if (batchItems.length === 0) {
      toast.error("Add at least one itinerary row before submitting.");
      return;
    }
    setBatchSubmitting(true);
    try {
      // Generate the PDF directly from the hidden FTIPrintDocument, upload to
      // Google Drive, then mark the FTI as SENT — no preview required.
      await ftiService.updateRequest(formData.ftiRef, {
        status: "SENT",
        details: mapBatchToDetails(),
      });
      toast.success(`FTI ${formData.ftiRef} submitted and PDF saved to Drive.`);
      setBatchItems([]);
      setEditingItemId(null);
      setPreviewOpen(false);
      setViewMode("list");
      await loadFTIRequests();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit FTI request",
      );
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handleAddToBatch();
  };

  const loadRequestIntoForm = useCallback((full: FTIRequestFull) => {
    setFormData((prev) => ({
      ...prev,
      ftiRef: full.controlNo,
      technician: full.userName,
    }));
    setCurrentStatus(full.status);
    setRequestDateCreated(full.dateCreated);
    setBatchItems(
      full.details.map((det) => {
        const fuel =
          det.fuelSubTotal !== undefined
            ? det.fuelSubTotal
            : computeFuelCost(det.km, det.fuelPrice);
        const miscAmount = det.expenses.reduce((s, e) => s + e.amount, 0);
        const miscCodes = det.expenses.map((e) => e.miscCode).join(", ");
        const miscDescriptions = det.expenses
          .map(
            (e) =>
              formInfo?.miscellaneousFull.find((m) => m.code === e.miscCode)
                ?.description || e.miscCode,
          )
          .join(", ");
        const firstLeg = det.legs?.[0];
        const originName = firstLeg?.originName || "AERICH INNOVATION CORP.";
        const originAddress = firstLeg?.originAddress || "";
        return {
          id: det.detailId,
          date: det.date,
          itinerary: det.itinerary,
          description: det.description,
          km: det.km,
          fuelPrice: det.fuelPrice,
          tollFee: det.tollFee,
          miscellaneous: miscCodes,
          miscellaneousDescription: miscDescriptions,
          miscAmount,
          totalAmount: computeDetailTotal(det, det.expenses),
          fuelAmount: fuel,
          origin: originName,
          originAddress: originAddress,
          destinations:
            det.legs && det.legs.length > 0
              ? det.legs.map((leg) => ({
                  id: leg.legId,
                  name: leg.destName,
                  address: leg.destAddress,
                  distanceKm: leg.distanceKm,
                  segments: Array.isArray(leg.segments)
                    ? leg.segments.map((s) => ({
                        id: s.segmentId,
                        group: s.groupName,
                        entry: s.entryGate,
                        exit: s.exitGate,
                        tollFee: s.tollFee || 0,
                      }))
                    : [],
                }))
              : [],
        };
      }),
    );
  }, []);

  const handleCreateNew = async () => {
    try {
      const ref = formInfo?.ftiRef || generateNewRef();
      const created = await ftiService.createRequest({ controlNo: ref });
      setFormData((prev) => ({
        ...prev,
        ftiRef: created.controlNo,
        technician: formInfo?.currentUserFullName || "",
        origin: "AERICH INNOVATION CORP.",
      }));
      setCurrentStatus(created.status);
      setRequestDateCreated(created.dateCreated);
      setBatchItems([]);
      setEditingItemId(null);
      setDestinations([]);
      setTotalKm(null);
      setSelectedDate(new Date());
      setViewMode("create");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create FTI request",
      );
    }
  };

  const handleViewItem = async (item: FTIRequestSummary) => {
    try {
      const full = await ftiService.getRequest(item.controlNo);
      setViewRequest(full);
      setViewModalOpen(true);
    } catch {
      toast.error("Failed to load FTI details.");
    }
  };

  const handleApprovalAction = async (
    action: "approve" | "request_change" | "reject",
    comment: string,
  ) => {
    if (!viewRequest) return;
    if (action === "request_change" && !comment.trim()) {
      toast.error("Please enter a comment for the requester.");
      return;
    }
    setApprovalInProgress(true);
    try {
      let fileLink: string | undefined;
      if (action === "approve") {
        // Fetch the approver's e-signature to render on the signed PDF.
        let signatureUrl = "";
        try {
          const sig = await userService.getSignatureByUsername(
            formInfo?.currentUserUsername || "",
          );
          signatureUrl = sig?.imageUrl || "";
        } catch {
          // no signature on file — proceed without the image
        }
        setApprovedBy(formInfo?.currentUserFullName || "");
        setApprovedBySignatureUrl(signatureUrl);
        // Let the modal re-render with the approval block before capture.
        await new Promise((r) => setTimeout(r, 150));
        const blob = await generatePdfBlob();
        fileLink = await saveGdToGoogleDrive(blob, viewRequest.controlNo);
      }
      await ftiService.approveAction(
        viewRequest.controlNo,
        action,
        comment.trim(),
        fileLink,
      );
      toast.success(
        action === "approve"
          ? "Request approved and PDF saved to Drive."
          : action === "request_change"
            ? "Change requested."
            : "Request rejected.",
      );
      setViewModalOpen(false);
      setApprovedBy("");
      setApprovedBySignatureUrl("");
      await loadFTIRequests();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to process approval.",
      );
    } finally {
      setApprovalInProgress(false);
    }
  };

  const handleEditListItem = async (item: FTIRequestSummary) => {
    if (!isEditableStatus(item.status)) {
      toast.error(`Cannot edit: status is ${item.status}.`);
      return;
    }
    try {
      const full = await ftiService.getRequest(item.controlNo);
      loadRequestIntoForm(full);
      setViewMode("edit");
    } catch {
      toast.error("Failed to load FTI for editing.");
    }
  };

  const handleDeleteListItem = (item: FTIRequestSummary) => {
    if (!isEditableStatus(item.status)) {
      toast.error(`Cannot delete: status is ${item.status}.`);
      return;
    }
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await ftiService.deleteRequest(deleteTarget.controlNo);
      toast.success(`Deleted ${deleteTarget.controlNo}.`);
      setDeleteTarget(null);
      await loadFTIRequests();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete FTI request",
      );
    }
  };

  const handleBackToList = () => {
    setViewMode("list");
    setEditingItemId(null);
  };

  const filteredRequests = useMemo(() => {
    return ftiRequests.filter((r) => {
      // Status filter
      if (
        statusFilter !== "ALL" &&
        r.status.toUpperCase() !== statusFilter.toUpperCase()
      ) {
        return false;
      }
      // User filter (admins only; regular users' data is already user-scoped)
      if (userFilter !== "ALL" && r.userId !== userFilter) {
        return false;
      }
      // Date range filter — compare the date part of dateCreated, inclusive
      if (dateRange?.from || dateRange?.to) {
        const createdDate = r.dateCreated?.slice(0, 10) || "";
        if (!createdDate) return false;
        if (dateRange.from) {
          const from = format(dateRange.from, "yyyy-MM-dd");
          if (createdDate < from) return false;
        }
        if (dateRange.to) {
          const to = format(dateRange.to, "yyyy-MM-dd");
          if (createdDate > to) return false;
        }
      }
      return true;
    });
  }, [ftiRequests, statusFilter, userFilter, dateRange]);

  const columns = useMemo<ColumnDef<FTIRequestSummary>[]>(
    () => [
      {
        accessorKey: "controlNo",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Control No. <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-blue-600 font-medium">
            {row.original.controlNo}
          </span>
        ),
      },
      {
        accessorKey: "userName",
        header: "User",
      },
      {
        accessorKey: "dateCreated",
        header: "Date Created",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          return <Badge className={statusBadgeClass(status)}>{status}</Badge>;
        },
      },
      {
        id: "ftiFileLink",
        header: "File Link",
        cell: ({ row }) => {
          const link = row.original.ftiFileLink;
          if (!link) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              Open PDF
            </a>
          );
        },
      },
      {
        accessorKey: "totalAmount",
        header: "Total Amount",
        cell: ({ row }) => (
          <span className="font-mono font-medium">
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const item = row.original;
          const editable = isEditableStatus(item.status);
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleViewItem(item)}
                title="View"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEditListItem(item)}
                disabled={!editable}
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => handleDeleteListItem(item)}
                disabled={!editable}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Helpers for the form ────────────────────
  const {
    miscellaneous,
    miscellaneousFull,
    tollGates,
    locations,
    expresswayGroups,
    currentUserFullName,
  } = formInfo || {
    miscellaneous: [],
    miscellaneousFull: [],
    tollGates: [],
    locations: [],
    expresswayGroups: [],
    currentUserFullName: "",
  };

  const locationOptions = locations.map((loc) => ({
    value: loc.companyName,
    label: loc.companyName,
  }));

  const getAddress = (companyName: string) => {
    const loc = locations.find((l) => l.companyName === companyName);
    return loc?.address || "";
  };

  const expresswayOptions = expresswayGroups.map((eg) => ({
    value: eg.name,
    label: eg.name,
  }));

  const getGatesForGroup = (groupName: string): string[] => {
    const group = expresswayGroups.find((eg) => eg.name === groupName);
    return group?.gates || [];
  };

  // Show Description in the dropdown; store the Code as the value.
  const miscOptions = (
    miscellaneousFull.length > 0
      ? miscellaneousFull
      : miscellaneous.map((c) => ({ code: c, description: c }))
  ).map((item) => ({
    value: item.code,
    label: item.description,
  }));

  const batchTotalToll = batchItems.reduce((s, i) => s + i.tollFee, 0);
  const batchTotalFuel = batchItems.reduce(
    (s, i) => s + computeFuelCost(i.km, i.fuelPrice, kmPerLiter),
    0,
  );
  const batchTotalMiscAmount = batchItems.reduce((s, i) => s + i.miscAmount, 0);
  const batchGrandTotal = batchItems.reduce((s, i) => s + i.totalAmount, 0);

  // ========== RENDER: LIST MODE ==========
  if (viewMode === "list") {
    if (loading || listLoading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {formInfo?.isAdmin && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Users</SelectItem>
                {(formInfo.users || []).map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DateRangePicker
            value={dateRange}
            onChange={(range) => setDateRange(range ?? {})}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All Statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <EntityTable
          title="Field Technicians Itinerary"
          columns={columns}
          data={filteredRequests}
          loading={false}
          onCreateNew={handleCreateNew}
        />

        <ConfirmDeleteDialog
          open={!!deleteTarget}
          title="Delete FTI Request"
          description={`Delete ${deleteTarget?.controlNo} and all associated itinerary and expense records? This cannot be undone.`}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />

        {/* View breakdown modal */}
        {viewRequest && (
          <FTIPreviewModal
            open={viewModalOpen}
            onOpenChange={setViewModalOpen}
            batchItems={viewRequest.details.map((det) => {
              const miscAmount = det.expenses.reduce((s, e) => s + e.amount, 0);
              return {
                id: det.detailId,
                date: det.date,
                itinerary: det.itinerary,
                description: det.description,
                km: det.km,
                fuelPrice: det.fuelPrice,
                tollFee: det.tollFee,
                miscellaneous: det.expenses.map((e) => e.miscCode).join(", "),
                miscellaneousDescription: det.expenses
                  .map(
                    (e) =>
                      formInfo?.miscellaneousFull.find(
                        (m) => m.code === e.miscCode,
                      )?.description || e.miscCode,
                  )
                  .join(", "),
                miscAmount,
                fuelAmount: det.fuelSubTotal,
                totalAmount: computeDetailTotal(det, det.expenses),
                origin: "AERICH INNOVATION CORP.",
                destinations: [],
              };
            })}
            ftiRef={viewRequest.controlNo}
            technician={viewRequest.userName}
            fullName={viewRequest.userName}
            kmPerLiter={kmPerLiter}
            onDownloadPdf={handleDownloadPdf}
            downloadingPdf={downloadingPdf}
            readOnly
            approvalActions={
              viewRequest.status.toUpperCase() === "SENT" &&
              approvers.some(
                (m) =>
                  m.approverUserId === formInfo?.currentUserId &&
                  m.requesterUserId === viewRequest.userId,
              )
                ? {
                    onApprove: (comment) =>
                      handleApprovalAction("approve", comment),
                    onRequestChange: (comment) =>
                      handleApprovalAction("request_change", comment),
                    onReject: (comment) =>
                      handleApprovalAction("reject", comment),
                    actionInProgress: approvalInProgress,
                  }
                : undefined
            }
            approvalComment={viewRequest.approvalComment}
            approvalStatus={viewRequest.status}
            approvedBy={approvedBy}
            approvedBySignatureUrl={approvedBySignatureUrl}
          />
        )}
      </div>
    );
  }

  // ========== RENDER: CREATE / EDIT MODE ==========
  const isReadOnlyForm = !isEditableStatus(currentStatus);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {viewMode === "edit" ? "Edit FTI Request" : "Create FTI Request"}
        </h1>
        <Button variant="outline" onClick={handleBackToList}>
          Back to List
        </Button>
      </div>

      {/* Request header info */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Control No.
              </Label>
              <p className="font-mono font-medium text-blue-600">
                {formData.ftiRef}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">User</Label>
              <p className="font-medium">{formData.technician || "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Date Created
              </Label>
              <p className="font-medium">{requestDateCreated || "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Badge className={statusBadgeClass(currentStatus)}>
                {currentStatus}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Entry Form ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Itinerary & Travel Details</CardTitle>
          <CardDescription>
            Add itinerary rows with route details, toll fees, and miscellaneous
            expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Row 1: Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={selectedDate} onChange={handleDateChange} />
              </div>
            </div>

            {/* Origin Group */}
            <div className="space-y-4">
              <div className="space-y-1.5 w-full">
                <Label>Origin</Label>
                <SearchableSelect
                  value={formData.origin}
                  onValueChange={(v) => handleFieldChange("origin", v)}
                  options={locationOptions}
                  placeholder="Select origin location"
                  searchPlaceholder="Search locations..."
                />
                <Input
                  value={getAddress(formData.origin)}
                  readOnly
                  disabled
                  className="bg-muted text-xs w-full"
                  placeholder="Origin address will appear here"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Itinerary <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={formData.itinerary}
                    onChange={(e) =>
                      handleFieldChange("itinerary", e.target.value)
                    }
                    placeholder="e.g., ACE BALIWAG"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={formData.description}
                    onChange={(e) =>
                      handleFieldChange("description", e.target.value)
                    }
                    placeholder="e.g., REBEDDING"
                    className="uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Destinations with Expressway Segments */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Destinations & Expressway Segments
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddDestination}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add Destination
                </Button>
              </div>
              {destinations.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No destinations added. Click "Add Destination" to add a
                  segment.
                </p>
              )}
              {destinations.map((dest, index) => (
                <div
                  key={dest.id}
                  className="border rounded-lg p-4 space-y-4 relative bg-card"
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Segment #{index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleRemoveDestination(dest.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1.5 w-full">
                    <Label className="text-xs font-medium">
                      Destination Name
                    </Label>
                    <SearchableSelect
                      value={dest.name}
                      onValueChange={(v) =>
                        handleDestinationNameChange(dest.id, v)
                      }
                      options={locationOptions}
                      placeholder="Select destination location"
                      searchPlaceholder="Search locations..."
                    />
                    <Input
                      value={getAddress(dest.name)}
                      readOnly
                      disabled
                      className="bg-muted text-xs w-full"
                      placeholder="Destination address will appear here"
                    />
                  </div>
                  <div className="space-y-3 w-full">
                    {dest.segments.map((seg) => {
                      const gateOptions = getGatesForGroup(seg.group).map(
                        (g) => ({ value: g, label: g }),
                      );
                      return (
                        <div
                          key={seg.id}
                          className="border rounded-md p-3 space-y-2 w-full bg-muted/20"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">
                              {seg.group || "Expressway"}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-destructive"
                              onClick={() =>
                                handleRemoveSegment(dest.id, seg.id)
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Group</Label>
                              <SearchableSelect
                                value={seg.group}
                                onValueChange={(v) => {
                                  handleSegmentChange(
                                    dest.id,
                                    seg.id,
                                    "group",
                                    v,
                                  );
                                  handleSegmentChange(
                                    dest.id,
                                    seg.id,
                                    "entry",
                                    "",
                                  );
                                  handleSegmentChange(
                                    dest.id,
                                    seg.id,
                                    "exit",
                                    "",
                                  );
                                  handleSegmentTollLookup(
                                    dest.id,
                                    seg.id,
                                    "",
                                    "",
                                  );
                                }}
                                options={expresswayOptions}
                                placeholder="Select expressway"
                                searchPlaceholder="Search expressway..."
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Entry</Label>
                              <SearchableSelect
                                value={seg.entry}
                                onValueChange={(v) => {
                                  handleSegmentChange(
                                    dest.id,
                                    seg.id,
                                    "entry",
                                    v,
                                  );
                                  handleSegmentTollLookup(
                                    dest.id,
                                    seg.id,
                                    v,
                                    seg.exit,
                                  );
                                }}
                                options={gateOptions}
                                placeholder="Select entry gate"
                                searchPlaceholder="Search gates..."
                                disabled={!seg.group}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Exit</Label>
                              <SearchableSelect
                                value={seg.exit}
                                onValueChange={(v) => {
                                  handleSegmentChange(
                                    dest.id,
                                    seg.id,
                                    "exit",
                                    v,
                                  );
                                  handleSegmentTollLookup(
                                    dest.id,
                                    seg.id,
                                    seg.entry,
                                    v,
                                  );
                                }}
                                options={gateOptions}
                                placeholder="Select exit gate"
                                searchPlaceholder="Search gates..."
                                disabled={!seg.group}
                              />
                            </div>
                          </div>
                          <div className="text-xs text-right text-muted-foreground pt-1">
                            Toll Fee:{" "}
                            <span className="font-mono font-medium text-foreground">
                              ₱{seg.tollFee.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {dest.segments.length < 5 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full py-3 border-dashed flex items-center justify-center gap-1.5"
                        onClick={() => handleAddSegment(dest.id)}
                      >
                        <Plus className="h-4 w-4" /> Add Expressway Segment
                      </Button>
                    )}
                  </div>
                  {dest.distanceKm !== undefined && (
                    <p className="text-xs text-muted-foreground text-right border-t pt-2">
                      Leg distance:{" "}
                      <span className="font-medium text-foreground">
                        {dest.distanceKm} km
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            {destinations.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Toll Fee:</span>
                  <span className="text-lg font-bold font-mono">
                    ₱{totalTollFee.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-medium">Total Distance:</span>
                  <span className="text-lg font-bold font-mono flex items-center gap-2">
                    {isCalculating ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : totalKm !== null ? (
                      <>{totalKm} km</>
                    ) : (
                      <span className="text-muted-foreground text-sm font-normal">
                        —
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Miscellaneous & Amount & Fuel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Miscellaneous</Label>
                <SearchableSelect
                  value={formData.miscellaneous}
                  onValueChange={(v) => handleFieldChange("miscellaneous", v)}
                  options={miscOptions}
                  placeholder="Select (optional)"
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (₱)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => handleFieldChange("amount", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Fuel Price (₱/L)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fuelPrice}
                  onChange={(e) =>
                    handleFieldChange("fuelPrice", e.target.value)
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const today = new Date();
                  setSelectedDate(today);
                  setFormData((prev) => ({
                    ...prev,
                    date: format(today, "yyyy-MM-dd"),
                    origin: "",
                    itinerary: "",
                    description: "",
                    miscellaneous: "",
                    amount: "",
                  }));
                  setDestinations([]);
                  setTotalKm(null);
                  setEditingItemId(null);
                }}
              >
                Reset Fields
              </Button>
              <Button type="submit" disabled={isReadOnlyForm}>
                {editingItemId ? (
                  <>Update Itinerary Row</>
                ) : (
                  <>
                    <Plus className="mr-1 h-4 w-4" /> Add Itinerary Row
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Draft Batch Table */}
      {batchItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Draft Batch — {batchItems.length} itinerary
                  {batchItems.length !== 1 ? "ies" : ""}
                </CardTitle>
                <CardDescription>
                  FTI Ref:{" "}
                  <span className="font-mono font-medium">
                    {formData.ftiRef}
                  </span>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleClearDraft}
                >
                  <FileX className="mr-1 h-4 w-4" /> Clear Draft
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Itinerary
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Description
                    </th>
                    <th className="px-3 py-2 text-right font-medium">KM</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Fuel Price
                    </th>
                    <th className="px-3 py-2 text-right font-medium">TOLL</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Fuel Subtotal
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Misc</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Misc Amt
                    </th>
                    <th className="px-3 py-2 text-right font-medium">TOTAL</th>
                    <th className="px-3 py-2 text-center font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batchItems.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">{item.date}</td>
                      <td className="px-3 py-2 uppercase">{item.itinerary}</td>
                      <td className="px-3 py-2 uppercase">
                        {item.description}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.km.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.fuelPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.tollFee.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {computeFuelCost(
                          item.km,
                          item.fuelPrice,
                          kmPerLiter,
                        ).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        {item.miscellaneous ? (
                          <Badge variant="secondary">
                            {miscellaneousFull.find(
                              (m) => m.code === item.miscellaneous,
                            )?.description || item.miscellaneous}{" "}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.miscAmount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">
                        {item.totalAmount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditBatchItem(item)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleRemoveBatchItem(item.id)}
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold bg-muted/40">
                    <td colSpan={5} className="px-3 py-2 text-right">
                      GRAND TOTAL:
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {batchTotalToll.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {batchTotalFuel.toFixed(2)}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-mono">
                      {batchTotalMiscAmount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {batchGrandTotal.toFixed(2)}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
          {!isReadOnlyForm && (
            <div className="flex justify-end gap-3 px-6 pb-6 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={batchItems.length === 0}
              >
                <Eye className="mr-1 h-4 w-4" /> Preview
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={batchSubmitting || batchItems.length === 0}
              >
                {batchSubmitting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                Save Draft
              </Button>
              <Button
                type="button"
                onClick={handleSubmitRequest}
                disabled={batchSubmitting || batchItems.length === 0}
              >
                {batchSubmitting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Submit Request
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Hidden printable document for direct PDF generation (no preview needed) */}
      <div
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          zIndex: -1,
          pointerEvents: "none",
        }}
      >
        <FTIPrintDocument
          batchItems={batchItems}
          ftiRef={formData.ftiRef}
          technician={formData.technician}
          fullName={currentUserFullName}
          kmPerLiter={kmPerLiter}
          id="fti-print-content"
        />
      </div>

      {/* Preview Modal */}
      <FTIPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        batchItems={batchItems}
        ftiRef={formData.ftiRef}
        technician={formData.technician}
        fullName={currentUserFullName}
        kmPerLiter={kmPerLiter}
        onDownloadPdf={handleDownloadPdf}
        downloadingPdf={downloadingPdf}
        onSaveData={handleSaveDraft}
        savingData={batchSubmitting}
      />
    </div>
  );
}

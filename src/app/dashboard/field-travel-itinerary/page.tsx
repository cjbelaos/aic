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
  Send,
  X,
  ReceiptText,
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
import { LocationSearchableSelect } from "@/components/ui/location-searchable-select";
import { LocationPickerDialog } from "@/components/location-picker-dialog";
import { CompanyPickerDialog } from "@/components/company-picker-dialog";
import type { LocationAddress } from "@/types/locationAddress";
import type { Company } from "@/types/company";
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
import LiquidationPreviewModal from "@/components/liquidation-preview-modal";
import LiquidationPrintDocument from "@/components/liquidation-print-document";
import { EntityTable } from "@/components/ui/entity-table";
import ftiService from "@/lib/services/fti.service";
import { userApproverService } from "@/lib/services/userApprover.service";
import { userService } from "@/lib/services/user.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import type { UserApprover } from "@/types/userApprover";
import type { LiquidationFull } from "@/types/liquidation";

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

interface MiscExpenseEntry {
  id: string;
  code: string;
  amount: string;
}

interface FormData {
  ftiRef: string;
  technician: string;
  date: string;
  origin: string;
  itinerary: string;
  description: string;
  miscellaneousExpenses: MiscExpenseEntry[];
  fuelPrice: string;
}

interface LocationItem {
  companyName: string;
  address: string;
  locationId?: string;
  latitude?: number;
  longitude?: number;
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
    miscellaneousExpenses: [],
    fuelPrice: "",
  });
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [totalKm, setTotalKm] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<string>("");
  const addressMapRef = useRef<Record<string, string>>({});
  const coordsMapRef = useRef<Record<string, { lat: number; lng: number }>>({});

  // ── Batch state ──────────────────────────────
  const [isMiscOnly, setIsMiscOnly] = useState(false);
  const [batchItems, setBatchItems] = useState<DraftItinerary[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
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
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);

  // ── Liquidation preview state ──
  const [liquidationsSummary, setLiquidationsSummary] = useState<
    Record<string, { liquidationId: string; status: string; userId: string } | null>
  >({});
  const [liquidationPreview, setLiquidationPreview] =
    useState<LiquidationFull | null>(null);
  const [liquidationPreviewOpen, setLiquidationPreviewOpen] = useState(false);
  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  const [liquidationDownloadingPdf, setLiquidationDownloadingPdf] =
    useState(false);
  const [liquidationDownloadingImage, setLiquidationDownloadingImage] =
    useState(false);

  // Only admins and the assigned approver may open the request modal (and thus
  // the screenshot-able document). Plain requesters are excluded to prevent the
  // "screenshot the draft → send in Messenger" approval bypass.
  const canViewListItem = (item: FTIRequestSummary): boolean => {
    if (formInfo?.isAdmin) return true;
    const currentUserId = formInfo?.currentUserId;
    if (!currentUserId) return false;
    if (item.approvedByUserId === currentUserId) return true;
    return approvers.some(
      (m) =>
        m.approverUserId === currentUserId && m.requesterUserId === item.userId,
    );
  };

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
      const coordsMap: Record<string, { lat: number; lng: number }> = {};
      (data.locations || []).forEach((loc: LocationItem) => {
        map[loc.companyName] = loc.address || loc.companyName;
        if (
          typeof loc.latitude === "number" &&
          typeof loc.longitude === "number"
        ) {
          coordsMap[loc.companyName] = {
            lat: loc.latitude,
            lng: loc.longitude,
          };
        }
      });
      addressMapRef.current = map;
      coordsMapRef.current = coordsMap;
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

  // ── Fetch linked liquidation summaries after requests load ──
  useEffect(() => {
    if (ftiRequests.length === 0) return;
    const controlNos = ftiRequests.map((r) => r.controlNo);
    let cancelled = false;
    (async () => {
      try {
        const summaries = await ftiService.getLinkedLiquidationSummaries(
          controlNos,
        );
        if (!cancelled) setLiquidationsSummary(summaries);
      } catch {
        // Non-critical; liquidation badges simply won't render.
      }
    })();
    return () => { cancelled = true; };
  }, [ftiRequests]);

  // Fetch misc lookup for liquidation previews
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await miscellaneousService.getAll();
        if (!cancelled) setMiscLookup(new Map(all.map((m) => [m.code, m.description])));
      } catch {
        // Non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        const originCoords = coordsMapRef.current[origin];
        const payload = {
          origin: originCoords
            ? { lat: originCoords.lat, lng: originCoords.lng }
            : originAddress,
          legs: legs.map((l) => {
            const destCoords = coordsMapRef.current[l.name];
            return {
              destination: destCoords
                ? { lat: destCoords.lat, lng: destCoords.lng }
                : addressMapRef.current[l.name] || l.name,
            };
          }),
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

  const handleCompanySaved = useCallback(
    (company: Company) => {
      loadFormInfo();
      toast.success(`"${company.companyName}" is now available in the list.`);
    },
    [loadFormInfo],
  );

  const handleLocationSaved = useCallback((loc: LocationAddress) => {
    setFormInfo((prev) => {
      if (!prev) return prev;
      const newLocation: LocationItem = {
        companyName: loc.locationName,
        address: loc.address,
        locationId: loc.locationId,
        latitude: loc.latitude,
        longitude: loc.longitude,
      };
      const exists = prev.locations.some(
        (l) => l.companyName.toLowerCase() === loc.locationName.toLowerCase(),
      );
      const locations = exists
        ? prev.locations.map((l) =>
            l.companyName.toLowerCase() === loc.locationName.toLowerCase()
              ? newLocation
              : l,
          )
        : [...prev.locations, newLocation];
      addressMapRef.current[loc.locationName] = loc.address;
      if (
        typeof loc.latitude === "number" &&
        typeof loc.longitude === "number"
      ) {
        coordsMapRef.current[loc.locationName] = {
          lat: loc.latitude,
          lng: loc.longitude,
        };
      }
      return { ...prev, locations };
    });
    toast.success(`"${loc.locationName}" is now available in the list.`);
  }, []);

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
  const handleAddToBatch = async () => {
    if (savingRow) {
      toast.info("Please wait — row is still being saved.");
      return;
    }
    if (!formData.date || !formData.itinerary) {
      toast.error("Please fill in required fields: Itinerary, Description");
      return;
    }
    if (!formData.description) {
      toast.error("Description is required.");
      return;
    }
    if (!isMiscOnly) {
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
        // Toll is only required if the destination has expressway segments.
        // Destinations without expressway segments can be saved with toll = 0.
        if (dest.segments.length > 0) {
          const legToll = dest.segments.reduce(
            (s, seg) => s + (seg.tollFee || 0),
            0,
          );
          if (legToll <= 0) {
            toast.error(`Toll fee is required for leg "${dest.name}".`);
            return;
          }
        }
      }
      if (
        totalTollFee <= 0 &&
        destinations.some((d) => d.segments.length > 0)
      ) {
        toast.error(
          "Total toll fee is required before adding the itinerary row.",
        );
        return;
      }
    } else if (
      !formData.miscellaneousExpenses.some(
        (m) => m.code && parseFloat(m.amount) > 0,
      )
    ) {
      toast.error(
        "Please add at least one miscellaneous expense with an amount.",
      );
      return;
    }

    setSavingRow(true);
    try {
      const km = isMiscOnly ? 0 : (totalKm ?? 0);
      const tollFee = isMiscOnly ? 0 : totalTollFee;
      const miscExpenses = formData.miscellaneousExpenses
        .filter((m) => m.code && parseFloat(m.amount) > 0)
        .map((m) => ({
          code: m.code,
          description:
            formInfo?.miscellaneousFull.find((x) => x.code === m.code)
              ?.description || m.code,
          amount: parseFloat(m.amount) || 0,
        }));
      const miscAmount = miscExpenses.reduce((s, m) => s + m.amount, 0);
      const fuelPrice = isMiscOnly ? 0 : parseFloat(formData.fuelPrice) || 0;
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
        miscellaneous: miscExpenses.map((m) => m.code).join(", "),
        miscellaneousDescription: miscExpenses
          .map((m) => m.description)
          .join(", "),
        miscAmount,
        miscExpenses,
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

      // ── Persist immediately to the database (DRAFT request) ──
      const detailPayload = {
        date: newItem.date,
        itinerary: newItem.itinerary,
        description: newItem.description,
        km: newItem.km,
        fuelPrice: newItem.fuelPrice,
        tollFee: newItem.tollFee,
        expenses:
          newItem.miscExpenses && newItem.miscExpenses.length > 0
            ? newItem.miscExpenses.map((m) => ({
                miscCode: m.code,
                amount: m.amount,
              }))
            : [],
        legs: (newItem.destinations || []).map((dest, index) => ({
          originName:
            index === 0 ? newItem.origin : newItem.destinations[index - 1].name,
          originAddress:
            index === 0
              ? newItem.originAddress || ""
              : newItem.destinations[index - 1].address || "",
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

      let ref = formData.ftiRef;
      if (!ref) {
        const created = await ftiService.createRequest({
          userId: formInfo?.currentUserId,
        });
        ref = created.controlNo;
        setFormData((prev) => ({ ...prev, ftiRef: ref }));
        setCurrentStatus(created.status);
        setRequestDateCreated(created.dateCreated);
      }
      try {
        localStorage.setItem(LS_ACTIVE_REF, ref);
      } catch {}

      if (editingItemId) {
        try {
          await ftiService.updateDetail(
            ref,
            editingItemId,
            detailPayload,
            formInfo?.currentUserId,
          );
          newItem.id = editingItemId;
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to update itinerary row.",
          );
          return;
        }
      } else {
        try {
          const saved = await ftiService.appendDetail(
            ref,
            detailPayload,
            formInfo?.currentUserId,
          );
          newItem.id = saved.detailId;
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to save itinerary row.",
          );
          return;
        }
      }

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
        // origin and fuelPrice are intentionally preserved after adding a row
        itinerary: "",
        description: "",
        miscellaneousExpenses: [],
      }));
      setSelectedDate(new Date());
    } finally {
      setSavingRow(false);
    }
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
      miscellaneousExpenses: (item.miscExpenses && item.miscExpenses.length > 0
        ? item.miscExpenses
        : item.miscellaneous
          ? [
              {
                code: item.miscellaneous,
                description: item.miscellaneousDescription,
                amount: item.miscAmount,
              },
            ]
          : []
      ).map((m) => ({
        id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
        code: m.code,
        amount: m.amount ? m.amount.toString() : "",
      })),
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
    // Detect misc-only rows (no fuel/toll/destinations) so the form
    // switches back into "Misc Only" mode when editing them.
    const isMiscOnlyRow =
      item.km === 0 &&
      item.fuelPrice === 0 &&
      item.tollFee === 0 &&
      (!item.destinations || item.destinations.length === 0);
    setIsMiscOnly(isMiscOnlyRow);
    setEditingItemId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info(
      "Editing itinerary. Update fields and click 'Update Itinerary in List' to save.",
    );
  };

  // ── Cancel edit batch item ────────────────────
  // Abandons the in-progress edit (the saved row stays untouched) and resets
  // the entry form back to blank defaults — same behavior as "Reset Fields".
  const handleCancelEdit = () => {
    if (!editingItemId) return;
    const today = new Date();
    setSelectedDate(today);
    setFormData((prev) => ({
      ...prev,
      date: format(today, "yyyy-MM-dd"),
      // origin stays at the default AERICH value — do not revert it
      itinerary: "",
      description: "",
      miscellaneousExpenses: [],
      // fuelPrice is intentionally preserved as it is used across rows
    }));
    setDestinations([]);
    setTotalKm(null);
    setEditingItemId(null);
    toast.info("Edit cancelled.");
  };

  const handleRemoveBatchItem = async (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
    if (editingItemId === id) setEditingItemId(null);
    try {
      await ftiService.deleteDetailRow(id);
      toast.success("Itinerary row deleted.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete itinerary row.",
      );
    }
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
      const blob = await generatePdfBlob();
      const filename = `FTI_${formData.ftiRef}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
      toast.success("PDF downloaded successfully.");
    } catch {
      toast.error("Failed to generate PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  /** Capture the visible FTI document as a PNG canvas. */
  const captureDocumentImage = async (): Promise<HTMLCanvasElement> => {
    const element =
      document.getElementById("fti-preview-content") ||
      document.getElementById("fti-print-content");
    if (!element) {
      throw new Error("FTI print document not found.");
    }
    // Mobile-safe scale; keeps canvas within mobile browser limits.
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const html2canvas = (await import("html2canvas-pro")).default;
    return await html2canvas(element, {
      scale: isMobile ? 1 : 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 850,
      windowHeight: element.scrollHeight,
    });
  };

  const handleDownloadImage = async () => {
    setDownloadingImage(true);
    try {
      const canvas = await captureDocumentImage();
      const url = canvas.toDataURL("image/png");
      const filename = `FTI_${formData.ftiRef}.png`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 1000);
      toast.success("Image downloaded successfully.");
    } catch {
      toast.error("Failed to generate image.");
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleShareImage = async () => {
    setSharingImage(true);
    try {
      const canvas = await captureDocumentImage();
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) {
        throw new Error("Could not create image blob.");
      }
      const filename = `FTI_${formData.ftiRef}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          files: [file],
          title: `FTI ${formData.ftiRef}`,
        });
        toast.success("Shared successfully.");
      } else {
        // Fallback: Web Share API not available (e.g. desktop) → download instead
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
        toast.success("Sharing not supported — image downloaded instead.");
      }
    } catch (err) {
      // user-cancelled or failure
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error("Failed to share image.");
      }
    } finally {
      setSharingImage(false);
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
        expenses:
          item.miscExpenses && item.miscExpenses.length > 0
            ? item.miscExpenses.map((m) => ({
                miscCode: m.code,
                amount: m.amount,
              }))
            : item.miscellaneous
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
    // Reduce render scale on small screens so the canvas stays within mobile
    // browser limits (~16MP). Desktop keeps scale 2 for crisp output.
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const canvas = await html2canvas(element, {
      scale: isMobile ? 1 : 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 850,
      windowHeight: element.scrollHeight,
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
      // The request (Control No + Date Created) is generated on the first
      // save/submit — not when the form is opened — so abandoned drafts do
      // not leave empty/orphan rows in the sheet.
      let ref = formData.ftiRef;
      if (!ref) {
        const created = await ftiService.createRequest();
        ref = created.controlNo;
        setFormData((prev) => ({ ...prev, ftiRef: ref }));
        setCurrentStatus(created.status);
        setRequestDateCreated(created.dateCreated);
      }
      await ftiService.updateRequest(ref, {
        status: submitStatus,
      });
      toast.success(
        submitStatus === "SENT"
          ? `FTI ${ref} sent successfully.`
          : `FTI ${ref} saved as draft.`,
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
      // Generate the request (Control No + Date Created) on submit if it has
      // not already been saved, then mark the FTI as SENT.
      let ref = formData.ftiRef;
      if (!ref) {
        const created = await ftiService.createRequest();
        ref = created.controlNo;
        setFormData((prev) => ({ ...prev, ftiRef: ref }));
        setCurrentStatus(created.status);
        setRequestDateCreated(created.dateCreated);
      }
      await ftiService.updateRequest(ref, {
        status: "SENT",
      });
      toast.success(`FTI ${ref} submitted and PDF saved to Drive.`);
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
      // Always default the form origin to AERICH when editing a request
      origin: "AERICH INNOVATION CORP.",
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
        const miscExpenses = det.expenses.map((e) => ({
          code: e.miscCode,
          description:
            formInfo?.miscellaneousFull.find((m) => m.code === e.miscCode)
              ?.description || e.miscCode,
          amount: e.amount,
        }));
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
          miscExpenses,
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
    // The request (Control No + Date Created) is generated lazily on the first
    // Save Draft / Submit Request, not when opening the form, so abandoned
    // entries do not leave orphan request rows in the sheet.
    try {
      setFormData((prev) => ({
        ...prev,
        ftiRef: "",
        technician: formInfo?.currentUserFullName || "",
        origin: "AERICH INNOVATION CORP.",
      }));
      setCurrentStatus("DRAFT");
      setRequestDateCreated("");
      setEditingItemId(null);
      setBatchItems([]);
      setDestinations([]);
      setTotalKm(null);
      setIsMiscOnly(false);
      setSelectedDate(new Date());
      setViewMode("create");
    } catch {
      toast.error("Failed to start a new FTI request.");
    }
  };

  const handleViewItem = async (item: FTIRequestSummary) => {
    if (!canViewListItem(item)) {
      toast.error("You are not authorized to view this request.");
      return;
    }
    try {
      const full = await ftiService.getRequest(item.controlNo);
      setViewRequest(full);
      setApprovedBy(full.approvedByName || "");
      setApprovedBySignatureUrl(full.approvedBySignatureUrl || "");
      setViewModalOpen(true);
    } catch {
      toast.error("Failed to load FTI details.");
    }
  };

  const handleViewLiquidation = async (controlNo: string) => {
    const summary = liquidationsSummary[controlNo];
    if (!summary) return;
    try {
      const isAdmin = formInfo?.isAdmin;
      // Admins pass the liquidation owner's userId to bypass user scoping
      const userIdParam = isAdmin ? `&userId=${encodeURIComponent(summary.userId)}` : "";
      const resp = await fetch(
        `/api/liquidations?controlNo=${encodeURIComponent(controlNo)}${userIdParam}`,
      );
      const data = await resp.json();
      const full = data?.liquidations?.[0] as LiquidationFull | undefined;
      if (full) {
        // getLiquidationFullByControlNoForUser does not resolve requesterName;
        // fall back to the FTI row's user name for the preview header.
        if (!full.requesterName) {
          const ownerRequest = ftiRequests.find(
            (r) => r.controlNo === controlNo,
          );
          full.requesterName = ownerRequest?.userName || "";
        }
        setLiquidationPreview(full);
        setLiquidationPreviewOpen(true);
      } else {
        toast.error("Liquidation not found.");
      }
    } catch {
      toast.error("Failed to load liquidation details.");
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
      let approvedName: string | undefined;
      let approvedSignature = "";
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
        approvedName = formInfo?.currentUserFullName;
        approvedSignature = signatureUrl;
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
        approvedName,
        approvedSignature,
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

  // ── Liquidation preview → PDF / Image export ──
  const getLiquidationPrintElement = () =>
    document.getElementById("fti-liquidation-print-content");

  const generateLiquidationPdfBlob = async (): Promise<Blob> => {
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

  const handleLiquidationDownloadPdf = async () => {
    setLiquidationDownloadingPdf(true);
    try {
      const blob = await generateLiquidationPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LIQUIDATION_${liquidationPreview?.controlNo || "draft"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Liquidation PDF downloaded.");
    } catch (error) {
      console.error("Liquidation PDF export failed:", error);
      toast.error("Failed to generate liquidation PDF.");
    } finally {
      setLiquidationDownloadingPdf(false);
    }
  };

  const handleLiquidationDownloadImage = async () => {
    setLiquidationDownloadingImage(true);
    try {
      const element = getLiquidationPrintElement();
      if (!element) throw new Error("Liquidation document not found.");
      await new Promise((r) => setTimeout(r, 150));
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `LIQUIDATION_${liquidationPreview?.controlNo || "draft"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Liquidation image downloaded.");
    } catch (error) {
      console.error("Liquidation image export failed:", error);
      toast.error("Failed to generate liquidation image.");
    } finally {
      setLiquidationDownloadingImage(false);
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
          const item = row.original;
          const link = item.ftiFileLink;
          if (!link) {
            return <span className="text-muted-foreground">—</span>;
          }
          const isApproved = item.status.toUpperCase() === "APPROVED";
          // Technicians may only open the signed PDF after approval; admins
          // and the assigned approver may open it at any time.
          if (!isApproved && !canViewListItem(item)) {
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
        id: "liquidation",
        header: "Liquidation",
        cell: ({ row }) => {
          const item = row.original;
          const summary = liquidationsSummary[item.controlNo];
          if (!summary) return <span className="text-muted-foreground">—</span>;
          const abbreviatedStatus =
            summary.status.toUpperCase() === "SUBMITTED"
              ? "Submitted"
              : summary.status.toUpperCase() === "APPROVED"
                ? "Approved"
                : summary.status.toUpperCase() === "REQUESTED_FOR_CHANGE"
                  ? "For Change"
                  : summary.status.toUpperCase() === "REJECTED"
                    ? "Rejected"
                    : summary.status;
          // Only the liquidation owner (technician) or an admin can open the
          // liquidation preview. Approvers see the status badge only.
          const canOpenLiquidation =
            formInfo?.isAdmin || formInfo?.currentUserId === summary.userId;
          return (
            <div className="flex items-center gap-2">
              <Badge className={statusBadgeClass(summary.status)}>
                {abbreviatedStatus}
              </Badge>
              {canOpenLiquidation && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleViewLiquidation(item.controlNo)}
                  title="View Liquidation"
                >
                  <ReceiptText className="h-4 w-4" />
                </Button>
              )}
            </div>
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
              {canViewListItem(item) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleViewItem(item)}
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
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
    [formInfo, approvers, liquidationsSummary],
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
              const miscExpenses = det.expenses.map((e) => ({
                code: e.miscCode,
                description:
                  formInfo?.miscellaneousFull.find((m) => m.code === e.miscCode)
                    ?.description || e.miscCode,
                amount: e.amount,
              }));
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
                miscExpenses,
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
            onDownloadImage={handleDownloadImage}
            downloadingImage={downloadingImage}
            onShareImage={handleShareImage}
            sharingImage={sharingImage}
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
        {/* Liquidation preview modal */}
        {liquidationPreview && (
          <LiquidationPreviewModal
            open={liquidationPreviewOpen}
            onOpenChange={setLiquidationPreviewOpen}
            controlNo={liquidationPreview.controlNo}
            fullName={liquidationPreview.requesterName || ""}
            items={liquidationPreview.items?.map((item) => ({
              date: item.date,
              description: item.description,
              category: item.category,
              amount: item.amount,
              receiptImageUrl: item.receiptImageUrl || undefined,
            })) || []}
            categories={[...miscLookup.keys()]}
            miscLookup={miscLookup}
            advances={liquidationPreview.totalAmountRequested || 0}
            onDownloadPdf={handleLiquidationDownloadPdf}
            downloadingPdf={liquidationDownloadingPdf}
            onDownloadImage={handleLiquidationDownloadImage}
            downloadingImage={liquidationDownloadingImage}
          />
        )}
        {/* Off-screen printable liquidation document */}
        <div className="fixed -left-[9999px] top-0" aria-hidden="true">
          <LiquidationPrintDocument
            controlNo={liquidationPreview?.controlNo || ""}
            fullName={liquidationPreview?.requesterName || ""}
            items={liquidationPreview?.items?.map((item) => ({
              date: item.date,
              description: item.description,
              category: item.category,
              amount: item.amount,
              receiptImageUrl: item.receiptImageUrl || undefined,
            })) || []}
            categories={[...miscLookup.keys()]}
            miscLookup={miscLookup}
            advances={liquidationPreview?.totalAmountRequested || 0}
            id="fti-liquidation-print-content"
          />
        </div>
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

      {/* Request header info (visible only when editing an existing request) */}
      {viewMode === "edit" && (
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
      )}

      {/* ── Entry Form ──────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Itinerary & Travel Details</CardTitle>
            <CardDescription>
              {isMiscOnly
                ? "Request budget for miscellaneous expenses only — fuel and toll are skipped."
                : "Add itinerary rows with route details, toll fees, and miscellaneous expenses."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/40">
            <Button
              type="button"
              variant={isMiscOnly ? "ghost" : "default"}
              size="sm"
              className="h-8"
              disabled={isReadOnlyForm}
              onClick={() => setIsMiscOnly(false)}
            >
              Travel + Misc
            </Button>
            <Button
              type="button"
              variant={isMiscOnly ? "default" : "ghost"}
              size="sm"
              className="h-8"
              disabled={isReadOnlyForm}
              onClick={() => {
                setIsMiscOnly(true);
                setDestinations([]);
                setTotalKm(null);
              }}
            >
              Misc Only
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Row 1: Date & Fuel Price */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={selectedDate} onChange={handleDateChange} />
              </div>
              {!isMiscOnly && (
                <div className="space-y-2">
                  <Label>
                    Fuel Price (₱/L) <span className="text-destructive">*</span>
                  </Label>
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
              )}
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

            {/* Origin Group */}
            {!isMiscOnly && (
              <div className="space-y-4">
                <div className="space-y-1.5 w-full">
                  <Label>
                    Origin <span className="text-destructive">*</span>
                  </Label>
                  <LocationSearchableSelect
                    value={formData.origin}
                    onValueChange={(v) => handleFieldChange("origin", v)}
                    options={locationOptions}
                    placeholder="Select origin location"
                    searchPlaceholder="Search locations..."
                    onAddLocation={() => setLocationPickerOpen(true)}
                    onAddCompany={() => setCompanyPickerOpen(true)}
                  />
                  <Input
                    value={getAddress(formData.origin)}
                    readOnly
                    disabled
                    className="bg-muted text-xs w-full"
                    placeholder="Origin address will appear here"
                  />
                </div>
              </div>
            )}

            {/* Destinations with Expressway Segments */}
            {!isMiscOnly && (
              <div className="space-y-4">
                <Label className="text-base font-semibold">
                  Destinations & Expressway Segments
                </Label>
                {destinations.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No destinations added yet.
                  </p>
                )}
                {/* Add Destination Button when list is EMPTY */}
                {destinations.length === 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full py-3 flex items-center justify-center gap-1.5 font-medium"
                    onClick={handleAddDestination}
                  >
                    <Plus className="h-4 w-4" /> Add Destination
                  </Button>
                )}
                {/* Render Destination Items */}
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
                        Destination Name{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <LocationSearchableSelect
                        value={dest.name}
                        onValueChange={(v) =>
                          handleDestinationNameChange(dest.id, v)
                        }
                        options={locationOptions}
                        placeholder="Select destination location"
                        searchPlaceholder="Search locations..."
                        onAddLocation={() => setLocationPickerOpen(true)}
                        onAddCompany={() => setCompanyPickerOpen(true)}
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
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 -ml-1"
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
                {/* Add Destination Button AFTER all destination cards */}
                {destinations.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full py-3 flex items-center justify-center gap-1.5 font-medium"
                    onClick={handleAddDestination}
                  >
                    <Plus className="h-4 w-4" /> Add Destination
                  </Button>
                )}
              </div>
            )}

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

            {/* Miscellaneous Expenses (multiple allowed) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Miscellaneous Expenses
                </Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs flex items-center gap-1"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      miscellaneousExpenses: [
                        ...prev.miscellaneousExpenses,
                        {
                          id:
                            crypto.randomUUID?.() ||
                            Math.random().toString(36).slice(2),
                          code: "",
                          amount: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add Miscellaneous
                </Button>
              </div>
              {formData.miscellaneousExpenses.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No miscellaneous expenses added.
                </p>
              )}
              {formData.miscellaneousExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_140px_40px] gap-3 items-end"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Item</Label>
                    <SearchableSelect
                      value={exp.code}
                      onValueChange={(v) =>
                        setFormData((prev) => ({
                          ...prev,
                          miscellaneousExpenses: prev.miscellaneousExpenses.map(
                            (m) => (m.id === exp.id ? { ...m, code: v } : m),
                          ),
                        }))
                      }
                      options={miscOptions}
                      placeholder="Select miscellaneous item"
                      searchPlaceholder="Search..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Amount (₱)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={exp.amount}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          miscellaneousExpenses: prev.miscellaneousExpenses.map(
                            (m) =>
                              m.id === exp.id
                                ? { ...m, amount: e.target.value }
                                : m,
                          ),
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        miscellaneousExpenses:
                          prev.miscellaneousExpenses.filter(
                            (m) => m.id !== exp.id,
                          ),
                      }))
                    }
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {formData.miscellaneousExpenses.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">
                  Total Misc:{" "}
                  <span className="font-mono font-medium text-foreground">
                    ₱
                    {formData.miscellaneousExpenses
                      .reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
                      .toFixed(2)}
                  </span>
                </p>
              )}
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
                    // origin stays at the default AERICH value — do not revert it
                    itinerary: "",
                    description: "",
                    miscellaneousExpenses: [],
                  }));
                  setDestinations([]);
                  setTotalKm(null);
                  setEditingItemId(null);
                }}
              >
                Reset Fields
              </Button>
              {editingItemId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                >
                  <X className="mr-1 h-4 w-4" /> Cancel Edit
                </Button>
              )}
              <Button type="submit" disabled={isReadOnlyForm || savingRow}>
                {savingRow ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />{" "}
                    {editingItemId ? "Updating..." : "Adding..."}
                  </>
                ) : editingItemId ? (
                  <>Update Row</>
                ) : (
                  <>
                    <Plus className="mr-1 h-4 w-4" />{" "}
                    {isMiscOnly ? "Add Misc-Only Row" : "Add Itinerary Row"}
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
                  {batchItems.map((item) => {
                    const expenses =
                      item.miscExpenses && item.miscExpenses.length > 0
                        ? item.miscExpenses
                        : item.miscellaneous
                          ? [
                              {
                                code: item.miscellaneous,
                                description: item.miscellaneousDescription,
                                amount: item.miscAmount,
                              },
                            ]
                          : [];
                    const rowCount = Math.max(1, expenses.length);
                    return Array.from({ length: rowCount }).map((_, idx) => {
                      const isMainRow = idx === 0;
                      const exp = expenses[idx];
                      return (
                        <tr
                          key={`${item.id}-${idx}`}
                          className="border-b hover:bg-muted/30"
                        >
                          <td className="px-3 py-2">
                            {isMainRow ? item.date : ""}
                          </td>
                          <td className="px-3 py-2 uppercase">
                            {isMainRow ? item.itinerary : ""}
                          </td>
                          <td className="px-3 py-2 uppercase">
                            {isMainRow ? item.description : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {isMainRow ? item.km.toFixed(2) : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {isMainRow ? item.fuelPrice.toFixed(2) : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {isMainRow ? item.tollFee.toFixed(2) : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {isMainRow
                              ? computeFuelCost(
                                  item.km,
                                  item.fuelPrice,
                                  kmPerLiter,
                                ).toFixed(2)
                              : ""}
                          </td>
                          <td className="px-3 py-2">
                            {exp ? (
                              <Badge
                                variant="secondary"
                                className="whitespace-nowrap"
                              >
                                {miscellaneousFull.find(
                                  (x) => x.code === exp.code,
                                )?.description ||
                                  exp.description ||
                                  exp.code}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {exp ? exp.amount.toFixed(2) : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            {isMainRow ? item.totalAmount.toFixed(2) : ""}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isMainRow ? (
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
                            ) : (
                              ""
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })}
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
              {formInfo?.isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                  disabled={batchItems.length === 0}
                >
                  <Eye className="mr-1 h-4 w-4" /> Preview
                </Button>
              )}
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
        onDownloadImage={handleDownloadImage}
        downloadingImage={downloadingImage}
        onShareImage={handleShareImage}
        sharingImage={sharingImage}
      />

      {/* Location Picker Dialog */}
      <LocationPickerDialog
        open={locationPickerOpen}
        onOpenChange={setLocationPickerOpen}
        onSaved={handleLocationSaved}
      />

      {/* Company Picker Dialog */}
      <CompanyPickerDialog
        open={companyPickerOpen}
        onOpenChange={setCompanyPickerOpen}
        onSaved={handleCompanySaved}
      />
    </div>
  );
}

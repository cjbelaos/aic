"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EntityTable, ArrowUpDown } from "@/components/ui/entity-table";
import {
  Hand,
  Loader2,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  FileText,
  UserCheck,
  RotateCcw,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DocumentHandover,
  DocumentOption,
  Assignee,
} from "@/types/documentHandover";

// ── Services ────────────────────────────────────────────────────────────────
import documentHandoverService from "@/lib/services/document-handover.service";
import deliveryService from "@/lib/services/delivery.service";
import serviceInvoiceService from "@/lib/services/service-invoice.service";
import userService from "@/lib/services/user.service";

function getHandoverAssigneeKey(handover: DocumentHandover) {
  if (handover.assignedToId) return `user:${handover.assignedToId}`;
  const name = handover.assignedToName.trim().toLocaleLowerCase();
  return name ? `external:${name}` : "unassigned";
}

function getAssignedTime(handover: DocumentHandover) {
  const time = handover.assignedAt ? new Date(handover.assignedAt).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

export default function DocumentTrackerPage() {
  /* Data state */
  const [handovers, setHandovers] = useState<DocumentHandover[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [documentOptions, setDocumentOptions] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* User context */
  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    fullName: string;
  }>({ userId: "", fullName: "" });

  /* Role context — userRoleId is stored in auth:user (1 = Admin) */
  const [currentUserRoleId] = useState<number>(() => {
    if (typeof window === "undefined") return 2;
    try {
      const raw = window.localStorage.getItem("auth:user");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed.userRoleId ?? 2;
    } catch {
      return 2;
    }
  });
  const isAdmin = currentUserRoleId === 1;
  const [myDocsOnly, setMyDocsOnly] = useState<boolean>(
    () => currentUserRoleId !== 1,
  );
  const [handoverAssigneeFilter, setHandoverAssigneeFilter] = useState("all");
  const [handoverDocumentTypeFilter, setHandoverDocumentTypeFilter] = useState<
    "all" | "delivery_receipt" | "service_invoice"
  >("all");

  /* Modal open states */
  const [modalOpen, setModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [singleReturnDocument, setSingleReturnDocument] =
    useState<DocumentHandover | null>(null);

  /* Form & selection state */
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [notes, setNotes] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDocType, setFilterDocType] = useState<
    "all" | "delivery_receipt" | "service_invoice"
  >("all");

  /* Return modal selection state */
  const [selectedHandoverIds, setSelectedHandoverIds] = useState<string[]>([]);
  const [returnNotes, setReturnNotes] = useState("");
  const [singleReturnNotes, setSingleReturnNotes] = useState("");
  const [returnSearchQuery, setReturnSearchQuery] = useState("");
  const [returnDocType, setReturnDocType] = useState<
    "all" | "delivery_receipt" | "service_invoice"
  >("all");
  const [returnAssignee, setReturnAssignee] = useState("all");

  /* ── Fetch Data ────────────────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get current user from localStorage
      let currentUserId = "";
      let currentUserName = "System";
      try {
        const raw = window.localStorage.getItem("auth:user");
        if (raw) {
          const parsed = JSON.parse(raw);
          currentUserId = parsed.userId || parsed.userName || "";
          currentUserName = parsed.fullName || parsed.userName || "System";
          setCurrentUser({
            userId: currentUserId,
            fullName: currentUserName,
          });
        }
      } catch {
        // ignore
      }

      // 2. Fetch handovers
      const handoversData = await documentHandoverService.getAll();
      setHandovers(handoversData);

      // 3. Fetch all users as assignees
      let allUsers: any[] = [];
      try {
        allUsers = await userService.getAllUsers();
      } catch {
        // ignore
      }

      const assigneeList = allUsers.map((u: any) => ({
        userId: u.userId || u.id,
        fullName: u.fullName || u.username || "Unknown",
        departmentName: u.departmentName || "",
      }));
      setAssignees(assigneeList);

      // 4. Fetch available documents (DRs and SRs not yet handed over).
      //    Only admins/secretaries can hand out new documents.
      let handedOverNumbers = new Set<string>();
      let drs: any[] = [];
      let srs: any[] = [];
      if (isAdmin) {
        handedOverNumbers = new Set(
          handoversData.map((h) => h.documentNumber),
        );
        try {
          [drs, srs] = await Promise.all([
            deliveryService.getAll(),
            serviceInvoiceService.getAll(),
          ]);
        } catch {
          // ignore
        }

        const drOptions: DocumentOption[] = (drs || [])
          .filter(
            (dr: any) =>
              !handedOverNumbers.has(String(dr.drNumber)) &&
              dr.status !== "deleted" &&
              dr.drNumber > 0,
          )
          .map((dr: any) => ({
            value: `dr_${dr.drNumber}`,
            documentType: "delivery_receipt" as const,
            documentNumber: String(dr.drNumber),
            customerName: dr.companyName || "",
            date: dr.date,
            label: `DR #${dr.drNumber} — ${dr.companyName || ""}`,
          }));

        const srOptions: DocumentOption[] = (srs || [])
          .filter(
            (sr: any) =>
              !handedOverNumbers.has(sr.invoiceNo) &&
              sr.status !== "deleted" &&
              !sr.invoiceNo.startsWith("DRAFT-"),
          )
          .map((sr: any) => ({
            value: `sr_${sr.invoiceNo}`,
            documentType: "service_invoice" as const,
            documentNumber: sr.invoiceNo,
            customerName: sr.companyName || "",
            date: sr.date,
            label: `SR #${sr.invoiceNo} — ${sr.companyName || ""}`,
          }));

        setDocumentOptions([...drOptions, ...srOptions]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load document tracker data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Computed Values ───────────────────────────────────────────────────── */

  const assigneeSelectOptions = useMemo(
    () => assignees.map((a) => ({ value: a.userId, label: a.fullName })),
    [assignees],
  );

  const filteredDocumentOptions = useMemo(() => {
    let options = documentOptions;

    if (filterDocType !== "all") {
      options = options.filter((d) => d.documentType === filterDocType);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      options = options.filter(
        (d) =>
          d.documentNumber.includes(query) ||
          (d.customerName && d.customerName.toLowerCase().includes(query)) ||
          d.label.toLowerCase().includes(query),
      );
    }

    return options;
  }, [documentOptions, filterDocType, searchQuery]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, DocumentOption[]>();
    filteredDocumentOptions.forEach((doc) => {
      const key = doc.customerName || "Uncategorized";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(doc);
    });
    return groups;
  }, [filteredDocumentOptions]);

  /* Rows actually shown — admin sees all (unless toggled), a non-admin is
     scoped to their own assignments by both the server and this filter. */
  const viewedHandovers = useMemo(
    () =>
      myDocsOnly && currentUser.userId
        ? handovers.filter((h) => h.assignedToId === currentUser.userId)
        : handovers,
    [handovers, myDocsOnly, currentUser.userId],
  );

  const assignedDocs = useMemo(
    () => viewedHandovers.filter((h) => h.status === "handed_over"),
    [viewedHandovers],
  );

  const handoverAssigneeOptions = useMemo(() => {
    const assigneesByKey = new Map<string, string>();

    viewedHandovers.forEach((handover) => {
      const key = getHandoverAssigneeKey(handover);
      if (assigneesByKey.has(key)) return;

      const name = handover.assignedToName.trim();
      assigneesByKey.set(
        key,
        name
          ? `${name}${handover.assigneeType === "external" ? " (External)" : ""}`
          : "Unassigned",
      );
    });

    return Array.from(assigneesByKey, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label),
    );
  }, [viewedHandovers]);

  const filteredHandoverRecords = useMemo(() => {
    const filtered = viewedHandovers.filter((handover) => {
      const matchesAssignee =
        handoverAssigneeFilter === "all" ||
        getHandoverAssigneeKey(handover) === handoverAssigneeFilter;
      const matchesDocumentType =
        handoverDocumentTypeFilter === "all" ||
        handover.documentType === handoverDocumentTypeFilter;
      return matchesAssignee && matchesDocumentType;
    });

    return filtered.sort(
      (a, b) => getAssignedTime(b) - getAssignedTime(a),
    );
  }, [
    handoverAssigneeFilter,
    handoverDocumentTypeFilter,
    viewedHandovers,
  ]);

  const filteredAssignedDocs = useMemo(() => {
    const query = returnSearchQuery.trim().toLowerCase();
    return assignedDocs.filter((doc) => {
      const matchesType =
        returnDocType === "all" || doc.documentType === returnDocType;
      const matchesAssignee =
        returnAssignee === "all" || doc.assignedToId === returnAssignee;
      const matchesQuery =
        !query ||
        doc.documentNumber.toLowerCase().includes(query) ||
        doc.customerName?.toLowerCase().includes(query) ||
        doc.assignedToName.toLowerCase().includes(query);
      return matchesType && matchesAssignee && matchesQuery;
    });
  }, [assignedDocs, returnAssignee, returnDocType, returnSearchQuery]);

  const stats = useMemo(() => {
    const total = handovers.length;
    const pending = handovers.filter((h) => h.status === "handed_over").length;
    const returned = handovers.filter((h) => h.status === "returned").length;
    return { total, pending, returned };
  }, [handovers]);

  /* ── Selection Helpers ──────────────────────────────────────────────────── */

  const toggleDocumentSelection = (docValue: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(docValue)
        ? prev.filter((v) => v !== docValue)
        : [...prev, docValue],
    );
  };

  const toggleGroupSelection = (docs: DocumentOption[]) => {
    const docValues = docs.map((d) => d.value);
    const allSelected = docValues.every((v) => selectedDocuments.includes(v));

    if (allSelected) {
      setSelectedDocuments((prev) =>
        prev.filter((v) => !docValues.includes(v)),
      );
    } else {
      setSelectedDocuments((prev) => [
        ...prev,
        ...docValues.filter((v) => !prev.includes(v)),
      ]);
    }
  };

  const isGroupFullySelected = (docs: DocumentOption[]) => {
    return docs.every((d) => selectedDocuments.includes(d.value));
  };

  const isGroupPartiallySelected = (docs: DocumentOption[]) => {
    const selected = docs.filter((d) => selectedDocuments.includes(d.value));
    return selected.length > 0 && selected.length < docs.length;
  };

  /* ── Batch Handover Action ────────────────────────────────────────────── */

  const handleBatchHandOver = async () => {
    if (selectedDocuments.length === 0) {
      toast.error("Please select at least one document.");
      return;
    }

    if (!selectedAssignee) {
      toast.error("Please select a person to assign the documents to.");
      return;
    }

    if (!currentUser.userId) {
      toast.error(
        "Unable to identify current user. Please refresh and try again.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const assignee = assignees.find((a) => a.userId === selectedAssignee);
      if (!assignee) throw new Error("Assignee not found");

      const selectedDocs = documentOptions.filter((d) =>
        selectedDocuments.includes(d.value),
      );

      const created = await documentHandoverService.batchCreate(
        selectedDocs.map((doc) => ({
          documentType: doc.documentType,
          documentNumber: doc.documentNumber,
          customerName: doc.customerName,
          assignedToId: assignee.userId,
          assignedToName: assignee.fullName,
          assigneeType: "internal",
          notes: notes || undefined,
        })),
      );

      setHandovers((prev) => [...created, ...prev]);

      setDocumentOptions((prev) =>
        prev.filter((d) => !selectedDocuments.includes(d.value)),
      );

      toast.success(
        `${selectedDocs.length} document(s) assigned to ${assignee.fullName}`,
      );

      setSelectedDocuments([]);
      setSelectedAssignee("");
      setNotes("");
      setModalOpen(false);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to assign documents.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Batch Return Action ──────────────────────────────────────────────── */

  const handleBatchReturn = async () => {
    if (selectedHandoverIds.length === 0) {
      toast.error("Please select at least one document to return.");
      return;
    }

    if (!currentUser.userId) {
      toast.error(
        "Unable to identify current user. Please refresh and try again.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await documentHandoverService.batchReturn(
        selectedHandoverIds,
        returnNotes || undefined,
      );

      setHandovers((prev) =>
        prev.map((h) =>
          selectedHandoverIds.includes(h.id)
            ? {
                ...h,
                status: "returned",
                returnedBy: currentUser.userId,
                returnedByName: currentUser.fullName,
                returnedAt: new Date().toISOString(),
                notes: returnNotes || h.notes,
              }
            : h,
        ),
      );

      toast.success(
        `${selectedHandoverIds.length} document(s) marked as returned`,
      );
      setReturnModalOpen(false);
      setSelectedHandoverIds([]);
      setReturnNotes("");
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to mark documents as returned.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSingleReturnConfirm = async () => {
    if (!singleReturnDocument) return;

    if (!currentUser.userId) {
      toast.error(
        "Unable to identify current user. Please refresh and try again.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await documentHandoverService.batchReturn(
        [singleReturnDocument.id],
        singleReturnNotes || undefined,
      );

      setHandovers((prev) =>
        prev.map((handover) =>
          handover.id === singleReturnDocument.id
            ? {
                ...handover,
                status: "returned",
                returnedBy: currentUser.userId,
                returnedByName: currentUser.fullName,
                returnedAt: new Date().toISOString(),
                notes: singleReturnNotes || handover.notes,
              }
            : handover,
        ),
      );

      toast.success(
        `${singleReturnDocument.documentType === "delivery_receipt" ? "DR" : "SR"} #${singleReturnDocument.documentNumber} marked as returned`,
      );
      setSingleReturnDocument(null);
      setSingleReturnNotes("");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to mark document as returned.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Single Return Handler ────────────────────────────────────────────── */

  const handleSingleReturn = useCallback(
    (id: string) => {
      const document = handovers.find((handover) => handover.id === id) ?? null;
      setSingleReturnDocument(document);
      setSingleReturnNotes("");
    },
    [handovers],
  );

  /* ── Table Columns ─────────────────────────────────────────────────────── */

  const columns: ColumnDef<DocumentHandover>[] = useMemo(
    () => [
      {
        accessorKey: "documentNumber",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Doc No.
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                row.original.documentType === "delivery_receipt"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200"
                  : "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200"
              }
            >
              {row.original.documentType === "delivery_receipt" ? "DR" : "SR"}
            </Badge>
            <span className="font-mono font-semibold tabular-nums">
              #{row.original.documentNumber}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ getValue }) => (
          <span className="font-medium">{String(getValue() ?? "—")}</span>
        ),
      },
      {
        accessorKey: "assignedToName",
        header: "Assigned To",
        cell: ({ getValue, row }) => (
          <div className="flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{String(getValue() ?? "—")}</span>
            {row.original.assigneeType === "external" && (
              <Badge variant="secondary" className="text-[10px]">External</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "assignedAt",
        header: "Assigned",
        cell: ({ getValue }) => {
          const raw = String(getValue() ?? "");
          if (!raw) return "—";
          try {
            return new Date(raw).toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          } catch {
            return raw;
          }
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const s = String(getValue());
          return s === "returned" ? (
            <Badge className="bg-green-600 hover:bg-green-700">Returned</Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300"
            >
              Assigned
            </Badge>
          );
        },
      },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ getValue }) => {
          const val = String(getValue() ?? "").trim();
          return val ? (
            <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
              {val}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const isPending = row.original.status === "handed_over";
          return isPending ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
              onClick={() => handleSingleReturn(row.original.id)}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Return
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" /> Completed
            </span>
          );
        },
      },
    ],
    [handleSingleReturn],
  );

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Document Tracker
          </h1>
          <p className="text-muted-foreground text-sm">
            Track physical documents assigned to staff and monitor returns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 pr-2">
            <Checkbox
              id="my-docs-only"
              checked={myDocsOnly}
              onCheckedChange={(checked) => setMyDocsOnly(!!checked)}
            />
            <Label
              htmlFor="my-docs-only"
              className="text-sm cursor-pointer select-none"
            >
              My Docs Only
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedHandoverIds([]);
              setReturnModalOpen(true);
            }}
            disabled={assignedDocs.length === 0}
            className="gap-2 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
          >
            <BadgeCheck className="h-4 w-4" />
            Batch Return
          </Button>
          {isAdmin && (
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              <Hand className="h-4 w-4" />
              Assign Document
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Tracked</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Total document transactions logged
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">
              Pending Returns
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {stats.pending}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently assigned to staff
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Returned</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.returned}
            </div>
            <p className="text-xs text-muted-foreground">
              Successfully processed back into office
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Primary Data Table */}
      <EntityTable
        title="Handover Records"
        columns={columns}
        data={filteredHandoverRecords}
        loading={loading}
        mobileLayout={{ primary: ["documentNumber", "customerName", "status"], labels: { documentNumber: "Document", customerName: "Customer", assignedToName: "Assigned to", assignedAt: "Assigned at", status: "Status", notes: "Notes", actions: "Actions" } }}
        toolbarFilters={
          <>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="handover-assignee-filter"
                  className="text-sm font-normal text-muted-foreground whitespace-nowrap"
                >
                  Assigned to
                </Label>
                <select
                  id="handover-assignee-filter"
                  value={handoverAssigneeFilter}
                  onChange={(event) => setHandoverAssigneeFilter(event.target.value)}
                  className="h-8 w-[200px] rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All assignees</option>
                  {handoverAssigneeOptions.map((assignee) => (
                    <option key={assignee.value} value={assignee.value}>
                      {assignee.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label
                htmlFor="handover-document-type-filter"
                className="text-sm font-normal text-muted-foreground whitespace-nowrap"
              >
                Document type
              </Label>
              <select
                id="handover-document-type-filter"
                value={handoverDocumentTypeFilter}
                onChange={(event) =>
                  setHandoverDocumentTypeFilter(
                    event.target.value as
                      | "all"
                      | "delivery_receipt"
                      | "service_invoice",
                  )
                }
                className="h-8 w-[180px] rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">All document types</option>
                <option value="delivery_receipt">Delivery Receipts (DR)</option>
                <option value="service_invoice">Service Reports (SR)</option>
              </select>
            </div>
          </>
        }
      />

      {/* ── Assign Document Dialog (admin only) ────────────────────────────── */}
      {isAdmin && (

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hand className="h-5 w-5" />
              Assign Documents
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Assignee Selection */}
            <div className="space-y-2">
              <Label>Assign To</Label>
              <SearchableSelect
                value={selectedAssignee}
                onValueChange={setSelectedAssignee}
                options={assigneeSelectOptions}
                placeholder="Select a person..."
                searchPlaceholder="Search staff..."
              />
              {assigneeSelectOptions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No staff members found.
                </p>
              )}
            </div>

            {/* Document Filters */}
            <div className="flex flex-wrap gap-4 items-center">
              <Label className="text-sm font-medium">Document Type:</Label>
              <div className="flex gap-2">
                <Button
                  variant={filterDocType === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterDocType("all")}
                >
                  All
                </Button>
                <Button
                  variant={
                    filterDocType === "delivery_receipt" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setFilterDocType("delivery_receipt")}
                  className={
                    filterDocType === "delivery_receipt" ? "bg-blue-600" : ""
                  }
                >
                  📦 DR
                </Button>
                <Button
                  variant={
                    filterDocType === "service_invoice" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setFilterDocType("service_invoice")}
                  className={
                    filterDocType === "service_invoice" ? "bg-purple-600" : ""
                  }
                >
                  🧾 SR
                </Button>
              </div>
              <div className="flex-1">
                <Label htmlFor="assign-document-search" className="sr-only">
                  Search documents to assign
                </Label>
                <Input
                  id="assign-document-search"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedDocuments.length} selected
              </div>
            </div>

            {/* Document List with Grouping */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-1">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={(checked) => {
                      setSelectAll(!!checked);
                      if (checked) {
                        setSelectedDocuments(
                          documentOptions.map((d) => d.value),
                        );
                      } else {
                        setSelectedDocuments([]);
                      }
                    }}
                  />
                </div>
                <div className="col-span-3">Document</div>
                <div className="col-span-4">Customer</div>
                <div className="col-span-4">Date</div>
              </div>

              {groupedDocuments.size === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {documentOptions.length === 0 ? (
                    <>
                      <p>No available documents to assign.</p>
                      <p className="text-xs mt-1">
                        All documents have been assigned or none exist yet.
                      </p>
                    </>
                  ) : (
                    <p>No documents match your filters.</p>
                  )}
                </div>
              ) : (
                Array.from(groupedDocuments.entries()).map(
                  ([customer, docs]) => (
                    <Collapsible key={customer} defaultOpen={false}>
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 hover:bg-muted/50 border-t">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isGroupFullySelected(docs)}
                            data-state={
                              isGroupPartiallySelected(docs)
                                ? "indeterminate"
                                : isGroupFullySelected(docs)
                                  ? "checked"
                                  : "unchecked"
                            }
                            onCheckedChange={() =>
                              toggleGroupSelection(docs)
                            }
                          />
                        </div>
                        <CollapsibleTrigger className="flex flex-1 items-center gap-2">
                          <span className="font-medium">{customer}</span>
                          <Badge variant="secondary" className="text-xs">
                            {docs.length} document{docs.length > 1 ? "s" : ""}
                          </Badge>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {
                              docs.filter((d) =>
                                selectedDocuments.includes(d.value),
                              ).length
                            }{" "}
                            selected
                          </span>
                          {isGroupFullySelected(docs) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        {docs.map((doc) => (
                          <div
                            key={doc.value}
                            className={`grid grid-cols-12 gap-2 px-4 py-2 hover:bg-muted/30 border-t items-center ${
                              selectedDocuments.includes(doc.value)
                                ? "bg-muted/20"
                                : ""
                            }`}
                          >
                            <div className="col-span-1">
                              <Checkbox
                                checked={selectedDocuments.includes(doc.value)}
                                onCheckedChange={() =>
                                  toggleDocumentSelection(doc.value)
                                }
                              />
                            </div>
                            <div className="col-span-3 flex items-center gap-2">
                              {doc.documentType === "delivery_receipt" ? (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                                >
                                  DR
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                                >
                                  SR
                                </Badge>
                              )}
                              <span className="font-mono font-semibold">
                                #{doc.documentNumber}
                              </span>
                            </div>
                            <div className="col-span-4 text-sm truncate">
                              {doc.customerName || "—"}
                            </div>
                            <div className="col-span-4 text-sm text-muted-foreground">
                              {doc.date
                                ? new Date(doc.date).toLocaleDateString()
                                : "—"}
                            </div>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ),
                )
              )}
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {selectedDocuments.length} document
                {selectedDocuments.length !== 1 ? "s" : ""} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDocuments([])}
                disabled={selectedDocuments.length === 0}
              >
                Clear All
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Documents for client meeting"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBatchHandOver}
              disabled={
                selectedDocuments.length === 0 ||
                !selectedAssignee ||
                submitting ||
                !currentUser.userId
              }
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Hand className="h-4 w-4 mr-2" />
              )}
              Assign {selectedDocuments.length} Document
              {selectedDocuments.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* ── Batch Return Dialog ──────────────────────────────────────────── */}

      <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-green-600" />
              Batch Return Documents
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <Label htmlFor="return-search" className="sr-only">
                  Search documents to return
                </Label>
                <Input
                  id="return-search"
                  placeholder="Search DR/SR number, customer, or assignee..."
                  value={returnSearchQuery}
                  onChange={(event) => setReturnSearchQuery(event.target.value)}
                />
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant={returnDocType === "all" ? "default" : "outline"} onClick={() => setReturnDocType("all")}>All</Button>
                <Button size="sm" variant={returnDocType === "delivery_receipt" ? "default" : "outline"} onClick={() => setReturnDocType("delivery_receipt")}>DR</Button>
                <Button size="sm" variant={returnDocType === "service_invoice" ? "default" : "outline"} onClick={() => setReturnDocType("service_invoice")}>SR</Button>
              </div>
              <div className="min-w-48">
                <Label htmlFor="return-assignee" className="sr-only">Filter by assignee</Label>
                <select
                  id="return-assignee"
                  value={returnAssignee}
                  onChange={(event) => setReturnAssignee(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All assignees</option>
                  {Array.from(new Map(assignedDocs.map((doc) => [doc.assignedToId, doc.assignedToName])).entries()).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Select the documents physically returned to the office. {filteredAssignedDocs.length} of {assignedDocs.length} shown.
            </p>
            {/* List of assigned documents for batch return */}
            <div className="border rounded-lg overflow-hidden max-h-[48vh] overflow-y-auto">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground items-center">
                <div className="col-span-1">
                  <Checkbox
                    checked={
                      filteredAssignedDocs.length > 0 &&
                      filteredAssignedDocs.every((doc) =>
                        selectedHandoverIds.includes(doc.id),
                      )
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedHandoverIds(filteredAssignedDocs.map((h) => h.id));
                      } else {
                        setSelectedHandoverIds([]);
                      }
                    }}
                  />
                </div>
                <div className="col-span-3">Document</div>
                <div className="col-span-3">Assigned To</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-2">Assigned</div>
              </div>

              {filteredAssignedDocs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No assigned documents match the current filters.
                </div>
              ) : (
                filteredAssignedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`grid grid-cols-12 gap-2 px-4 py-2 border-t hover:bg-muted/30 items-center ${
                      selectedHandoverIds.includes(doc.id) ? "bg-muted/20" : ""
                    }`}
                  >
                    <div className="col-span-1">
                      <Checkbox
                        checked={selectedHandoverIds.includes(doc.id)}
                        onCheckedChange={() => {
                          setSelectedHandoverIds((prev) =>
                            prev.includes(doc.id)
                              ? prev.filter((id) => id !== doc.id)
                              : [...prev, doc.id],
                          );
                        }}
                      />
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      {doc.documentType === "delivery_receipt" ? (
                        <Badge
                          variant="outline"
                          className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                        >
                          DR
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                        >
                          SR
                        </Badge>
                      )}
                      <span className="font-mono font-semibold">
                        #{doc.documentNumber}
                      </span>
                    </div>
                    <div className="col-span-3 text-sm truncate">
                      {doc.assignedToName}
                      {doc.assigneeType === "external" ? " (External)" : ""}
                    </div>
                    <div className="col-span-3 text-sm truncate">
                      {doc.customerName || "—"}
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground">
                      {new Date(doc.assignedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {selectedHandoverIds.length} document
                {selectedHandoverIds.length !== 1 ? "s" : ""} selected
              </span>
              {selectedHandoverIds.length > 0 && (
                <Badge variant="outline" className="border-green-600 text-green-700">
                  Ready to return
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label>Return Notes (Optional)</Label>
              <Input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="e.g., All documents signed and returned"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBatchReturn}
              disabled={
                selectedHandoverIds.length === 0 ||
                submitting ||
                !currentUser.userId
              }
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark {selectedHandoverIds.length} as Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Focused Single Return Confirmation ───────────────────────────── */}
      <Dialog
        open={!!singleReturnDocument}
        onOpenChange={(open) => {
          if (!open) {
            setSingleReturnDocument(null);
            setSingleReturnNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-600" />
              Return document
            </DialogTitle>
          </DialogHeader>
          {singleReturnDocument && (
            <div className="space-y-4 py-3">
              <p className="text-sm text-muted-foreground">
                Mark this document as physically returned to the office?
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="font-mono font-semibold">
                  {singleReturnDocument.documentType === "delivery_receipt" ? "DR" : "SR"} #{singleReturnDocument.documentNumber}
                </div>
                <div><span className="text-muted-foreground">Customer: </span>{singleReturnDocument.customerName || "—"}</div>
                <div><span className="text-muted-foreground">Assigned to: </span>{singleReturnDocument.assignedToName}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="single-return-notes">Return Notes (Optional)</Label>
                <Input
                  id="single-return-notes"
                  value={singleReturnNotes}
                  onChange={(event) => setSingleReturnNotes(event.target.value)}
                  placeholder="e.g., Signed copy received"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleReturnDocument(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSingleReturnConfirm}
              disabled={submitting || !currentUser.userId}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Mark as Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

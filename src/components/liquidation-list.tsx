"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Loader2,
  Eye,
  Trash2,
  Plus,
  Pencil,
  FileText,
  ChevronDown,
  ReceiptText,
} from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "sonner";
import { liquidationService } from "@/lib/services/liquidation.service";
import { ftiService } from "@/lib/services/fti.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { userService } from "@/lib/services/user.service";
import { LiquidationForm } from "@/components/liquidation-form";
import LiquidationPreviewModal from "@/components/liquidation-preview-modal";
import LiquidationPrintDocument, {
  type LiquidationFtiComparison,
} from "@/components/liquidation-print-document";
import type { LiquidationFull } from "@/types/liquidation";

interface StoredUser {
  userId?: string;
  userRoleId?: number;
  departmentId?: number;
}

function getStoredUser(): StoredUser {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return {};
    return JSON.parse(raw) as StoredUser;
  } catch {
    return {};
  }
}

function statusBadgeClass(status: string): string {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REQUESTED_FOR_CHANGE":
      return "bg-amber-100 text-amber-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "SUBMITTED":
    case "SENT":
      return "bg-blue-100 text-blue-800";
    case "SAVED":
    case "DRAFT":
    default:
      return "bg-gray-100 text-gray-800";
  }
}

const STATUS_OPTIONS = [
  "ALL",
  "SAVED",
  "SUBMITTED",
  "APPROVED",
  "REQUESTED_FOR_CHANGE",
  "REJECTED",
] as const;

function formatAuditDate(value?: string): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LiquidationList() {
  const [liquidations, setLiquidations] = useState<LiquidationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [storedUser] = useState<StoredUser>(getStoredUser);
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [previewLiquidation, setPreviewLiquidation] =
    useState<LiquidationFull | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedLiquidation, setSelectedLiquidation] =
    useState<LiquidationFull | null>(null);

  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  const [mappedRequesterIds, setMappedRequesterIds] = useState<Set<string>>(
    new Set(),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"fti" | "other">("fti");
  const [createInitialControlNo, setCreateInitialControlNo] = useState("");
  const [editingLiquidation, setEditingLiquidation] =
    useState<LiquidationFull | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiquidationFull | null>(
    null,
  );
  const [previewFullName, setPreviewFullName] = useState("");
  const [previewFtiComparison, setPreviewFtiComparison] =
    useState<LiquidationFtiComparison | null>(null);

  const currentUserId = storedUser.userId || "";
  const userRoleId = storedUser.userRoleId || 0;
  const departmentId = storedUser.departmentId || 0;
  const isAdmin = userRoleId === 1;
  const isBod = departmentId === 4;

  // Fetch miscellaneous lookup map to resolve codes to descriptions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await miscellaneousService.getAll();
        if (!cancelled) {
          setMiscLookup(new Map(all.map((m) => [m.code, m.description])));
        }
      } catch {
        // Non-critical; fall back to showing the code.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch mapped approvers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: userApproverService } =
          await import("@/lib/services/userApprover.service");
        const all = await userApproverService.getAll();
        if (!cancelled) {
          const mapped = new Set<string>();
          for (const a of all) {
            if (a.approverUserId === currentUserId) {
              mapped.add(a.requesterUserId);
            }
          }
          setMappedRequesterIds(mapped);
        }
      } catch {
        // Non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const refreshList = async () => {
    let data: LiquidationFull[];
    if (isAdmin) {
      data = await liquidationService.getAllLiquidations();
    } else if (isBod) {
      data = await liquidationService.getBodLiquidations();
    } else {
      data = await liquidationService.getMyLiquidations();
    }
    setLiquidations(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshList();
        if (!cancelled) setError(null);
      } catch (err) {
        console.error("Failed to load liquidations:", err);
        if (!cancelled) setError("Failed to load liquidations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isBod]);

  const handleApprovalAction = async (
    liquidationId: string,
    action: "approve" | "request_change" | "reject",
    comment: string,
  ) => {
    setApprovingId(liquidationId);
    try {
      await liquidationService.approve(liquidationId, action, comment);
      toast.success("Liquidation status updated.");
      await refreshList();
      const newStatus =
        action === "approve"
          ? "APPROVED"
          : action === "request_change"
            ? "REQUESTED_FOR_CHANGE"
            : "REJECTED";
      setPreviewLiquidation((prev) =>
        prev && prev.liquidationId === liquidationId
          ? { ...prev, status: newStatus }
          : prev,
      );
    } catch (err) {
      console.error("Approval action failed:", err);
      toast.error("Failed to update liquidation status.");
    } finally {
      setApprovingId(null);
    }
  };

  const canDelete = (liquidation: LiquidationFull): boolean => {
    if (liquidation.userId !== currentUserId) return false;
    const status = (liquidation.status || "").toUpperCase();
    return status === "SAVED" || status === "REQUESTED_FOR_CHANGE";
  };

  const canEditLiquidation = (liquidation: LiquidationFull): boolean => {
    if (liquidation.userId !== currentUserId) return false;
    const status = (liquidation.status || "").toUpperCase();
    return status === "SAVED" || status === "REQUESTED_FOR_CHANGE";
  };

  const canApprove = (liquidation: LiquidationFull): boolean => {
    if (isBod && (liquidation.status || "").toUpperCase() === "SUBMITTED") {
      return true;
    }
    if ((liquidation.status || "").toUpperCase() !== "SUBMITTED") {
      return false;
    }
    if (currentUserId === "") return false;
    if (liquidation.approvedByUserId === currentUserId) return true;
    return mappedRequesterIds.has(liquidation.userId);
  };

  const handleDeleteConfirm = async () => {
    const id = deleteTarget?.liquidationId;
    if (!id) return;
    try {
      await liquidationService.deleteLiquidation(id);
      toast.success("Liquidation deleted.");
      setDeleteTarget(null);
      setLiquidations((prev) => prev.filter((l) => l.liquidationId !== id));
    } catch (err) {
      console.error("Delete liquidation failed:", err);
      toast.error("Failed to delete liquidation.");
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of liquidations) {
      if (!map.has(l.userId)) {
        map.set(l.userId, l.requesterName || l.userId);
      }
    }
    return Array.from(map.entries()).map(([userId, fullName]) => ({
      userId,
      fullName,
    }));
  }, [liquidations]);

  const filteredLiquidations = useMemo(() => {
    return liquidations.filter((l) => {
      if (userFilter !== "ALL" && l.userId !== userFilter) return false;
      if (
        statusFilter !== "ALL" &&
        (l.status || "").toUpperCase() !== statusFilter.toUpperCase()
      ) {
        return false;
      }
      return true;
    });
    // Default listing order: newest activity first (Date = UpdatedAt).
  }, [liquidations, userFilter, statusFilter]);

  // Display order: latest first based on UpdatedAt (falling back to CreatedAt).
  const sortedLiquidations = useMemo(() => {
    return [...filteredLiquidations].sort((a, b) =>
      (b.updatedAt || b.createdAt || "").localeCompare(
        a.updatedAt || a.createdAt || "",
      ),
    );
  }, [filteredLiquidations]);

  useEffect(() => {
    if (!previewLiquidation) return;
    const name = previewLiquidation.requesterName;
    if (name) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await userService.getUserById(
          previewLiquidation.userId,
        );
        if (!cancelled && profile?.fullName) {
          setPreviewFullName(profile.fullName);
        }
      } catch {
        if (!cancelled) setPreviewFullName(previewLiquidation.userId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewLiquidation]);

  // Fetch the linked FTI's fuel/toll/misc totals so the printed document can
  // render the FTI comparison row when previewing an FTI-linked liquidation.
  useEffect(() => {
    const controlNo = previewLiquidation?.controlNo;
    if (!controlNo) {
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
  }, [previewLiquidation?.controlNo]);

  const previewDisplayName =
    previewLiquidation?.requesterName ||
    previewFullName ||
    previewLiquidation?.userId ||
    "";

  const getLiquidationPrintElement = () =>
    document.getElementById("liquidation-list-print-content");

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
      a.download = `LIQUIDATION_${previewLiquidation?.controlNo || "draft"}.pdf`;
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
      link.download = `LIQUIDATION_${previewLiquidation?.controlNo || "draft"}.png`;
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

  const handleViewItems = (liquidation: LiquidationFull) => {
    setSelectedLiquidation(liquidation);
    setItemsModalOpen(true);
  };

  const openCreate = (mode: "fti" | "other", controlNo = "") => {
    setCreateMode(mode);
    setCreateInitialControlNo(controlNo);
    setCreateOpen(true);
  };

  // Deep-link support: /dashboard/expense-liquidation?controlNo=CTRL-...
  // (e.g. "Add Expense Liquidation" from the FTI preview modal).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cn = params.get("controlNo");
    if (cn) {
      openCreate("fti", cn);
      window.history.replaceState({}, "", "/dashboard/expense-liquidation");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createNewElement = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600 text-white w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Create New
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {departmentId === 1 && (
          <DropdownMenuItem onClick={() => openCreate("fti")}>
            <ReceiptText className="h-4 w-4" />
            FTI Linked
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openCreate("other")}>
          <Plus className="h-4 w-4" />
          No FTI (Other)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: ColumnDef<LiquidationFull>[] = [
    {
      accessorKey: "updatedAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs">
          {formatAuditDate(row.original.updatedAt || row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: "controlNo",
      header: "Reference No.",
      cell: ({ row }) =>
        row.original.controlNo ? (
          <span className="font-mono text-blue-600 font-medium">
            {row.original.controlNo}
          </span>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No Reference
          </Badge>
        ),
    },
    {
      accessorKey: "requesterName",
      header: "Requester",
      cell: ({ row }) => row.original.requesterName || row.original.userId,
    },
    {
      id: "receipts",
      header: "Receipts",
      cell: ({ row }) => `${row.original.items.length} item(s)`,
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
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge className={statusBadgeClass(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const liquidation = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8"
              onClick={() => handleViewItems(liquidation)}
              title="View Items"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPreviewLiquidation(liquidation)}
              title="Preview"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canEditLiquidation(liquidation) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditingLiquidation(liquidation)}
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canDelete(liquidation) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => setDeleteTarget(liquidation)}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading liquidations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.userId} value={u.userId}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[180px]">
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
        title="Expense Liquidations"
        columns={columns}
        data={sortedLiquidations}
        loading={false}
        headerActions={createNewElement}
      />

      {/* Items Modal - Table View */}
      <Dialog open={itemsModalOpen} onOpenChange={setItemsModalOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Receipt Items
              {selectedLiquidation && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {selectedLiquidation.controlNo || "No Reference"} •{" "}
                  {selectedLiquidation.items.length} item(s)
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedLiquidation?.requesterName && (
                <span>Requester: {selectedLiquidation.requesterName}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {selectedLiquidation && selectedLiquidation.items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No receipt items on record.</p>
              </div>
            ) : (
              <div className="pb-4">
                <div className="rounded-md border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border hover:bg-transparent">
                        <TableHead className="font-semibold text-xs whitespace-nowrap">
                          Date
                        </TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap">
                          Category
                        </TableHead>
                        <TableHead className="font-semibold text-xs min-w-[150px]">
                          Description
                        </TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap">
                          Supplier
                        </TableHead>
                        <TableHead className="font-semibold text-xs text-right whitespace-nowrap">
                          Amount
                        </TableHead>
                        <TableHead className="font-semibold text-xs text-right whitespace-nowrap">
                          Gross
                        </TableHead>
                        <TableHead className="font-semibold text-xs text-right whitespace-nowrap">
                          VAT
                        </TableHead>
                        <TableHead className="font-semibold text-xs text-right whitespace-nowrap">
                          EWT
                        </TableHead>
                        <TableHead className="font-semibold text-xs text-center whitespace-nowrap">
                          Receipt
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLiquidation?.items.map((item) => (
                        <TableRow key={item.receiptItemId}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {item.date}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {miscLookup.get(item.category) || item.category}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.description}
                            {(item.siNumber || item.orNumber) && (
                              <span className="block text-[10px] text-muted-foreground">
                                {item.siNumber
                                  ? `SI: ${item.siNumber}`
                                  : `OR: ${item.orNumber}`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {item.supplierName || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {formatCurrency(item.amount || 0)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {item.grossAmount != null
                              ? formatCurrency(item.grossAmount)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {item.vat != null ? formatCurrency(item.vat) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {item.ewt != null ? formatCurrency(item.ewt) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.receiptImageUrl ? (
                              <a
                                href={item.receiptImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-blue-600 underline"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Preview modal ── */}
      {previewLiquidation && (
        <>
          <LiquidationPreviewModal
            open={previewLiquidation !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewLiquidation(null);
            }}
            controlNo={previewLiquidation.controlNo || ""}
            fullName={previewDisplayName}
            items={previewLiquidation.items.map((it) => ({
              date: it.date,
              description: it.description,
              category: it.category,
              amount: it.amount,
              receiptImageUrl: it.receiptImageUrl || undefined,
              siNumber: it.siNumber || undefined,
              siDate: it.siDate || undefined,
              drNumber: it.drNumber || undefined,
              drDate: it.drDate || undefined,
              crNumber: it.crNumber || undefined,
              crDate: it.crDate || undefined,
              bsNumber: it.bsNumber || undefined,
              bsDate: it.bsDate || undefined,
              orNumber: it.orNumber || undefined,
              orDate: it.orDate || undefined,
              othersDate: it.othersDate || undefined,
              refNo: it.refNo || undefined,
              tin: it.tin || undefined,
              supplierName: it.supplierName || undefined,
              address: it.address || undefined,
              checkNo: it.checkNo || undefined,
              cvNo: it.cvNo || undefined,
              particulars: it.particulars || undefined,
              grossAmount: it.grossAmount,
              vat: it.vat,
              ewt: it.ewt,
            }))}
            categories={Array.from(miscLookup.keys())}
            miscLookup={miscLookup}
            advances={previewLiquidation?.totalAmountRequested || 0}
            fti={previewFtiComparison}
            onDownloadPdf={handleDownloadPdf}
            downloadingPdf={downloadingPdf}
            onDownloadImage={handleDownloadImage}
            downloadingImage={downloadingImage}
            readOnly={!canApprove(previewLiquidation)}
            approvalActions={
              canApprove(previewLiquidation)
                ? {
                    onApprove: (comment) =>
                      handleApprovalAction(
                        previewLiquidation.liquidationId,
                        "approve",
                        comment,
                      ),
                    onRequestChange: (comment) =>
                      handleApprovalAction(
                        previewLiquidation.liquidationId,
                        "request_change",
                        comment,
                      ),
                    onReject: (comment) =>
                      handleApprovalAction(
                        previewLiquidation.liquidationId,
                        "reject",
                        comment,
                      ),
                    actionInProgress:
                      approvingId === previewLiquidation.liquidationId,
                  }
                : undefined
            }
            approvalComment={previewLiquidation.approvalComment || ""}
            approvalStatus={previewLiquidation.status}
            approvedBy={previewLiquidation.approvedByName || ""}
            approvedBySignatureUrl={
              previewLiquidation.approvedBySignatureUrl || ""
            }
          />
          <div className="fixed -left-[9999px] top-0" aria-hidden="true">
            <LiquidationPrintDocument
              controlNo={previewLiquidation.controlNo || ""}
              fullName={previewDisplayName}
              items={previewLiquidation.items.map((it) => ({
                date: it.date,
                description: it.description,
                category: it.category,
                amount: it.amount,
                receiptImageUrl: it.receiptImageUrl || undefined,
                siNumber: it.siNumber || undefined,
                siDate: it.siDate || undefined,
                drNumber: it.drNumber || undefined,
                drDate: it.drDate || undefined,
                crNumber: it.crNumber || undefined,
                crDate: it.crDate || undefined,
                bsNumber: it.bsNumber || undefined,
                bsDate: it.bsDate || undefined,
                orNumber: it.orNumber || undefined,
                orDate: it.orDate || undefined,
                othersDate: it.othersDate || undefined,
                refNo: it.refNo || undefined,
                tin: it.tin || undefined,
                supplierName: it.supplierName || undefined,
                address: it.address || undefined,
                checkNo: it.checkNo || undefined,
                cvNo: it.cvNo || undefined,
                particulars: it.particulars || undefined,
                grossAmount: it.grossAmount,
                vat: it.vat,
                ewt: it.ewt,
              }))}
              categories={Array.from(miscLookup.keys())}
              miscLookup={miscLookup}
              advances={previewLiquidation?.totalAmountRequested || 0}
              fti={previewFtiComparison}
              id="liquidation-list-print-content"
              approvedBy={previewLiquidation.approvedByName || ""}
              approvedBySignatureUrl={
                previewLiquidation.approvedBySignatureUrl || ""
              }
            />
          </div>
        </>
      )}

      {/* Create modal */}
      <Dialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) refreshList();
        }}
      >
        <DialogContent
          className="sm:max-w-5xl max-h-[92vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {createMode === "fti"
                ? "Create Expense Liquidation"
                : "Create Expense Liquidation (No FTI)"}
            </DialogTitle>
          </DialogHeader>
          <LiquidationForm
            key={`create-${createMode}-${createInitialControlNo}`}
            userId={currentUserId}
            initialControlNo={createInitialControlNo}
            restrictToOther={departmentId !== 1 || createMode === "other"}
            onCancel={() => {
              setCreateOpen(false);
              refreshList();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Liquidation modal */}
      <Dialog
        open={editingLiquidation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingLiquidation(null);
            refreshList();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-5xl max-h-[92vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Expense Liquidation</DialogTitle>
          </DialogHeader>
          <LiquidationForm
            key={editingLiquidation?.liquidationId || "edit-liquidations"}
            userId={currentUserId}
            editingLiquidation={editingLiquidation}
            restrictToOther={
              editingLiquidation ? !editingLiquidation.controlNo : false
            }
            onCancel={() => {
              setEditingLiquidation(null);
              refreshList();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        title="Delete Liquidation"
        description={`Delete ${deleteTarget?.controlNo || "this liquidation"} and all associated receipt items? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
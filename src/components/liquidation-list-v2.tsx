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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "sonner";
import { liquidationV2Service } from "@/lib/services/liquidation-v2.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { userService } from "@/lib/services/user.service";
import { LiquidationFormV2 } from "@/components/liquidation-form-v2";
import LiquidationPreviewModalV2 from "@/components/liquidation-preview-modal-v2";
import LiquidationPrintDocumentV2 from "@/components/liquidation-print-document-v2";
import type { LiquidationFullV2 } from "@/types/liquidation-v2";

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

export function LiquidationListV2() {
  const [liquidations, setLiquidations] = useState<LiquidationFullV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [storedUser] = useState<StoredUser>(getStoredUser);
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [previewLiquidation, setPreviewLiquidation] =
    useState<LiquidationFullV2 | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedLiquidation, setSelectedLiquidation] =
    useState<LiquidationFullV2 | null>(null);

  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  const [mappedRequesterIds, setMappedRequesterIds] = useState<Set<string>>(
    new Set(),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editingLiquidation, setEditingLiquidation] =
    useState<LiquidationFullV2 | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiquidationFullV2 | null>(
    null,
  );
  const [previewFullName, setPreviewFullName] = useState("");

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

  // Fetch the mapped approver set so the current user can approve when
  // approvedByUserId wasn't persisted on the row.
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
    let data: LiquidationFullV2[];
    if (isAdmin) {
      data = await liquidationV2Service.getAllLiquidations();
    } else if (isBod) {
      data = await liquidationV2Service.getBodLiquidations();
    } else {
      data = await liquidationV2Service.getMyLiquidations();
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
        console.error("Failed to load V2 liquidations:", err);
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
      await liquidationV2Service.approve(liquidationId, action, comment);
      toast.success("Liquidation V2 status updated.");
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

  const canDelete = (liquidation: LiquidationFullV2): boolean => {
    if (liquidation.userId !== currentUserId) return false;
    const status = (liquidation.status || "").toUpperCase();
    return status === "SAVED" || status === "REQUESTED_FOR_CHANGE";
  };

  const canEditLiquidation = (liquidation: LiquidationFullV2): boolean => {
    if (liquidation.userId !== currentUserId) return false;
    const status = (liquidation.status || "").toUpperCase();
    return status === "SAVED" || status === "REQUESTED_FOR_CHANGE";
  };

  const canApprove = (liquidation: LiquidationFullV2): boolean => {
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
      await liquidationV2Service.deleteLiquidation(id);
      toast.success("Liquidation V2 deleted.");
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

  // Derive the user list (admin filter) from the loaded liquidations.
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
  }, [liquidations, userFilter, statusFilter]);
// Resolve the full name for the preview modal's Prepared by field.
  // requesterName (when present) is used directly; only resolve via the Users
  // sheet asynchronously for legacy records that lack it.
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

  const previewDisplayName =
    previewLiquidation?.requesterName ||
    previewFullName ||
    previewLiquidation?.userId ||
    "";

  // ── Preview → PDF / Image export (mirrors the production flow) ──
  const getLiquidationPrintElement = () =>
    document.getElementById("liquidation-list-v2-print-content");

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
      a.download = `LIQUIDATION_V2_${previewLiquidation?.controlNo || "draft"}.pdf`;
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
      link.download = `LIQUIDATION_V2_${previewLiquidation?.controlNo || "draft"}.png`;
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

  const handleViewItems = (liquidation: LiquidationFullV2) => {
    setSelectedLiquidation(liquidation);
    setItemsModalOpen(true);
  };
const columns: ColumnDef<LiquidationFullV2>[] = [
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
        Loading liquidations V2...
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
      {/* ── TESTING badge ── */}
      <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
        <Badge className="bg-amber-500 text-white uppercase tracking-wider">
          [TESTING]
        </Badge>
        <div>
          <p className="text-sm font-bold text-amber-800">
            Expense Liquidation V2
          </p>
          <p className="text-xs text-amber-700">
            Sandbox page — reads/writes the isolated ReceiptItems_V2 /
            Liquidations_V2 tabs. Production liquidation data is untouched.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto border-amber-300 text-amber-700 hover:bg-amber-100"
          onClick={() => window.open("/dashboard/expense-liquidation", "_blank")}
        >
          Go to Production
        </Button>
      </div>

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
        title="Expense Liquidations V2"
        columns={columns}
        data={filteredLiquidations}
        loading={false}
        headerActions={
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create V2 Liquidation
          </Button>
        }
      />
{/* Items Modal - Table View */}
      <Dialog open={itemsModalOpen} onOpenChange={setItemsModalOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Receipt Items (V2)
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
                            {miscLookup.get(item.miscellaneousCode) ||
                              item.miscellaneousCode}
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
          <LiquidationPreviewModalV2
            open={previewLiquidation !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewLiquidation(null);
            }}
            controlNo={previewLiquidation.controlNo || ""}
            fullName={previewDisplayName}
            items={previewLiquidation.items.map((it) => ({
              date: it.date,
              description: it.description,
              miscellaneousCode: it.miscellaneousCode,
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
            <LiquidationPrintDocumentV2
              controlNo={previewLiquidation.controlNo || ""}
              fullName={previewDisplayName}
              items={previewLiquidation.items.map((it) => ({
                date: it.date,
                description: it.description,
                miscellaneousCode: it.miscellaneousCode,
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
              id="liquidation-list-v2-print-content"
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
            <DialogTitle className="flex items-center gap-2">
              Create Expense Liquidation V2
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                Testing
              </span>
            </DialogTitle>
          </DialogHeader>
          <LiquidationFormV2
            userId={currentUserId}
            restrictToOther={departmentId !== 1}
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
            <DialogTitle>Edit Expense Liquidation V2</DialogTitle>
          </DialogHeader>
          <LiquidationFormV2
            key={editingLiquidation?.liquidationId || "edit-liquidations-v2"}
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
        title="Delete Liquidation V2"
        description={`Delete ${deleteTarget?.controlNo || "this liquidation"} and all associated receipt items from the V2 sandbox tabs? This cannot be undone. Production data is safe.`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ReceiptText,
  FileText,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  MessageSquareWarning,
  XCircle,
  Filter,
  Eye,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { liquidationService } from "@/lib/services/liquidation.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { ftiService } from "@/lib/services/fti.service";
import type { LiquidationFull } from "@/types/liquidation";
import type { FTIRequestSummary } from "@/types/fti";
import LiquidationPreviewModal from "@/components/liquidation-preview-modal";
import LiquidationPrintDocument from "@/components/liquidation-print-document";

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

const DEPARTMENT_NAMES: Record<number, string> = {
  1: "After Sales",
  2: "Project",
  3: "Admin",
  4: "BOD",
};

export function LiquidationHistory() {
  const [liquidations, setLiquidations] = useState<LiquidationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [storedUser] = useState<StoredUser>(getStoredUser);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  // Preview modal state
  const [previewLiquidation, setPreviewLiquidation] = useState<LiquidationFull | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  // Lookup map for miscellaneous code → description
  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  // Set of requester userIds for which the current user is the mapped approver
  const [mappedRequesterIds, setMappedRequesterIds] = useState<Set<string>>(new Set());
  // Delete confirmation state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Edit FTI linkage state
  const [editFtiTarget, setEditFtiTarget] = useState<LiquidationFull | null>(null);
  const [editFtiControlNo, setEditFtiControlNo] = useState("");
  const [editFtiRequests, setEditFtiRequests] = useState<FTIRequestSummary[]>([]);
  const [editFtiLoading, setEditFtiLoading] = useState(false);
  const [editFtiSaving, setEditFtiSaving] = useState(false);
  // Set of FTI ControlNos already linked to other liquidations (for warning display).
  const [usedControlNos, setUsedControlNos] = useState<Set<string>>(new Set());

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
    return () => { cancelled = true; };
  }, []);

  // Fetch the approver mappings so the current user can approve liquidations
  // even when approvedByUserId wasn't persisted on the liquidation row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: userApproverService } = await import(
          "@/lib/services/userApprover.service"
        );
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
        // Non-critical; fall back to approvedByUserId check only.
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let data: LiquidationFull[];
        if (isAdmin) {
          data = await liquidationService.getAllLiquidations();
        } else if (isBod) {
          data = await liquidationService.getBodLiquidations();
        } else {
          data = await liquidationService.getMyLiquidations();
        }
        if (!cancelled) setLiquidations(data);
      } catch (err) {
        console.error("Failed to load liquidation history:", err);
        if (!cancelled) setError("Failed to load your liquidation history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isBod]);

  const handleApprovalAction = async (
    liquidationId: string,
    action: "approve" | "request_change" | "reject",
  ) => {
    setApprovingId(liquidationId);
    try {
      await liquidationService.approve(liquidationId, action, comment);
      toast.success("Liquidation status updated.");
      setComment("");
      // Refresh
      const data = isAdmin
        ? await liquidationService.getAllLiquidations()
        : isBod
          ? await liquidationService.getBodLiquidations()
          : await liquidationService.getMyLiquidations();
      setLiquidations(data);
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

  const canEditFtiLinkage = (liquidation: LiquidationFull): boolean => {
    if (liquidation.userId !== currentUserId) return false;
    const status = (liquidation.status || "").toUpperCase();
    return status === "SAVED" || status === "REQUESTED_FOR_CHANGE";
  };

  const handleOpenEditFti = async (liquidation: LiquidationFull) => {
    setEditFtiTarget(liquidation);
    setEditFtiControlNo(liquidation.controlNo || "");
    setEditFtiLoading(true);
    try {
      const requests = await ftiService.getRequests();
      const usable = requests
        .filter((r) => r.status !== "SAVED" && r.userId === currentUserId)
        .sort((a, b) =>
          (b.dateCreated || "").localeCompare(a.dateCreated || ""),
        );
      setEditFtiRequests(usable);
      // Build set of FTI control numbers already used by other liquidations
      // (excluding the current one being edited).
      const used = new Set<string>();
      for (const l of liquidations) {
        if (l.controlNo && l.liquidationId !== liquidation.liquidationId) {
          used.add(l.controlNo);
        }
      }
      setUsedControlNos(used);
    } catch (error) {
      console.error("Failed to load FTI requests:", error);
      toast.error("Failed to load FTI requests.");
    } finally {
      setEditFtiLoading(false);
    }
  };

  const handleSaveEditFti = async () => {
    const target = editFtiTarget;
    if (!target) return;
    setEditFtiSaving(true);
    try {
      await liquidationService.updateControlNo(
        target.liquidationId,
        editFtiControlNo,
      );
      toast.success("FTI linkage updated successfully.");
      setEditFtiTarget(null);
      setEditFtiControlNo("");
      setUsedControlNos(new Set());
      // Refresh the list
      const data = isAdmin
        ? await liquidationService.getAllLiquidations()
        : isBod
          ? await liquidationService.getBodLiquidations()
          : await liquidationService.getMyLiquidations();
      setLiquidations(data);
    } catch (error) {
      console.error("Failed to update FTI linkage:", error);
      toast.error("Failed to update FTI linkage.");
    } finally {
      setEditFtiSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const id = deleteTargetId;
    if (!id) return;
    setDeletingId(id);
    try {
      await liquidationService.deleteLiquidation(id);
      toast.success("Liquidation deleted.");
      setDeleteTargetId(null);
      setDeleteConfirmInput("");
      // Remove from local state
      setLiquidations((prev) => prev.filter((l) => l.liquidationId !== id));
    } catch (err) {
      console.error("Delete liquidation failed:", err);
      toast.error("Failed to delete liquidation.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

  // Filter by department for admin view
  const filteredLiquidations =
    isAdmin && departmentFilter !== "all"
      ? liquidations.filter((l) => {
          const deptId = l.requesterDepartmentId;
          return deptId != null && String(deptId) === departmentFilter;
        })
      : liquidations;

  // Determine if the current user can approve a given liquidation
  const canApprove = (liquidation: LiquidationFull): boolean => {
    if (isBod && (liquidation.status || "").toUpperCase() === "SUBMITTED") {
      return true;
    }
    if ((liquidation.status || "").toUpperCase() !== "SUBMITTED") {
      return false;
    }
    if (currentUserId === "") return false;
    // Directly assigned approver (approvedByUserId was set on submit)
    if (liquidation.approvedByUserId === currentUserId) return true;
    // Fallback: check if the current user is the mapped approver for the
    // requester (handles cases where approvedByUserId wasn't persisted).
    return mappedRequesterIds.has(liquidation.userId);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading liquidation history...
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (liquidations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <History className="h-12 w-12 text-muted-foreground" />
          <CardTitle className="text-xl">No Liquidations Yet</CardTitle>
          <p className="max-w-md text-sm text-muted-foreground">
            {isAdmin
              ? "No liquidations have been submitted across all departments."
              : isBod
                ? "No pending liquidations require your review."
                : "You have not submitted any expense liquidations yet. Head over to the Expense Liquidation form to submit your first batch."}
          </p>
          {!isAdmin && !isBod && (
            <Button asChild className="mt-2">
              <Link href="/dashboard/expense-liquidation">
                <ReceiptText className="mr-2 h-4 w-4" />
                Submit Expense Liquidation
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Admin department filter ── */}
      {isAdmin && (
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Department</Label>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {Object.entries(DEPARTMENT_NAMES).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-sm text-muted-foreground">
              {liquidations.length} liquidation(s)
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Preview modal ── */}
      <LiquidationPreviewModal
        open={previewLiquidation !== null}
        onOpenChange={(open) => { if (!open) setPreviewLiquidation(null); }}
        controlNo={previewLiquidation?.controlNo || ""}
        fullName={previewLiquidation?.requesterName || ""}
        items={previewLiquidation?.items?.map((item) => ({
          date: item.date,
          description: item.description,
          category: item.category,
          amount: item.amount,
          receiptImageUrl: item.receiptImageUrl || undefined,
        })) || []}
        categories={[...miscLookup.keys()]}
        miscLookup={miscLookup}
        advances={previewLiquidation?.totalAmountRequested || 0}
        onDownloadPdf={handleDownloadPdf}
        downloadingPdf={downloadingPdf}
        onDownloadImage={handleDownloadImage}
        downloadingImage={downloadingImage}
      />
      <div className="fixed -left-[9999px] top-0" aria-hidden="true">
        <LiquidationPrintDocument
          controlNo={previewLiquidation?.controlNo || ""}
          fullName={previewLiquidation?.requesterName || ""}
          items={previewLiquidation?.items?.map((item) => ({
            date: item.date,
            description: item.description,
            category: item.category,
            amount: item.amount,
            receiptImageUrl: item.receiptImageUrl || undefined,
          })) || []}
          categories={[...miscLookup.keys()]}
          miscLookup={miscLookup}
          advances={previewLiquidation?.totalAmountRequested || 0}
          id="liquidation-print-content"
        />
      </div>

      {filteredLiquidations.map((liquidation) => {
        const isExpanded = expandedId === liquidation.liquidationId;
        const showApproval = canApprove(liquidation);

        return (
          <Card key={liquidation.liquidationId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Liquidation #{liquidation.liquidationId.slice(0, 8)}
                    <Badge
                      className={statusBadgeClass(liquidation.status)}
                      variant="outline"
                    >
                      {liquidation.status || "SAVED"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {liquidation.liquidationId}
                  </CardDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs text-blue-600"
                    >
                      FTI: {liquidation.controlNo || "N/A"}
                    </Badge>
                    {liquidation.requesterName && (
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {liquidation.requesterName}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <CardDescription>Total Amount</CardDescription>
                    <p className="text-lg font-bold tracking-tight">
                      {formatCurrency(liquidation.totalAmount)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewLiquidation(liquidation)}
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : liquidation.liquidationId)
                    }
                  >
                    {isExpanded ? (
                      <ChevronUp className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    )}
                    {isExpanded ? "Hide Items" : "View Items"}
                  </Button>
                  {canEditFtiLinkage(liquidation) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEditFti(liquidation)}
                    >
                      <ReceiptText className="mr-1 h-4 w-4" />
                      Edit FTI
                    </Button>
                  )}
                  {canDelete(liquidation) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setDeleteTargetId(liquidation.liquidationId);
                        setDeleteConfirmInput("");
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <CardDescription>
                {liquidation.items.length} receipt item(s)
              </CardDescription>

              {liquidation.approvedByName && (
                <CardDescription>
                  Approved by:{" "}
                  <span className="font-medium">
                    {liquidation.approvedByName}
                  </span>
                </CardDescription>
              )}

              {/* ── Approval actions ── */}
              {showApproval && (
                <div className="mt-3 space-y-2 rounded-xl border bg-muted/40 p-3">
                  <Label
                    htmlFor={`approval-comment-${liquidation.liquidationId}`}
                  >
                    Comment{" "}
                    <span className="text-xs text-muted-foreground">
                      (required for Request for Change)
                    </span>
                  </Label>
                  <Input
                    id={`approval-comment-${liquidation.liquidationId}`}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Type your comment..."
                    disabled={approvingId === liquidation.liquidationId}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() =>
                        handleApprovalAction(
                          liquidation.liquidationId,
                          "approve",
                        )
                      }
                      disabled={approvingId === liquidation.liquidationId}
                    >
                      {approvingId === liquidation.liquidationId ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() =>
                        handleApprovalAction(
                          liquidation.liquidationId,
                          "request_change",
                        )
                      }
                      disabled={approvingId === liquidation.liquidationId}
                    >
                      <MessageSquareWarning className="mr-1 h-4 w-4" />
                      Request for Change
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        handleApprovalAction(
                          liquidation.liquidationId,
                          "reject",
                        )
                      }
                      disabled={approvingId === liquidation.liquidationId}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>

            {isExpanded && (
              <CardContent>
                {liquidation.items.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No receipt items on record.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {liquidation.items.map((item) => {
                      return (
                        <div
                          key={item.receiptItemId}
                          className="rounded-xl border bg-card p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap text-sm font-medium">
                                  {item.date}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  {miscLookup.get(item.category) || item.category}
                                </Badge>
                              </div>
                              <p className="mt-1 truncate text-sm text-muted-foreground">
                                {item.description}
                              </p>
                              <p className="mt-1 text-lg font-bold">
                                {formatCurrency(item.amount)}
                              </p>
                            </div>
                            {item.receiptImageUrl ? (
                              <a
                                href={item.receiptImageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 flex flex-col items-center gap-1 rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors"
                                aria-label="Open receipt in Google Drive"
                              >
                                <FileText className="h-6 w-6 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  View Receipt
                                </span>
                              </a>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                No receipt
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ── Edit FTI Linkage Dialog ── */}
      {editFtiTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5" />
                Edit FTI Linkage
              </CardTitle>
              <CardDescription>
                Change the FTI ControlNo linked to this liquidation. Receipt
                items will be preserved. Only SAVED or REQUESTED_FOR_CHANGE
                liquidations can be updated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current FTI ControlNo</Label>
                <p className="font-mono text-sm font-medium">
                  {editFtiTarget.controlNo || "N/A (Other / No FTI)"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>New FTI ControlNo</Label>
                {editFtiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading FTI requests...
                  </div>
                ) : (
                  <>
                    <Select
                      value={editFtiControlNo}
                      onValueChange={setEditFtiControlNo}
                    >
                      <SelectTrigger className="h-11 text-base">
                        <SelectValue placeholder="Select FTI control no." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">
                          No FTI (Other)
                        </SelectItem>
                        {editFtiRequests.length === 0 ? (
                          <p className="px-4 py-2 text-sm text-muted-foreground">
                            No available FTI requests.
                          </p>
                        ) : (
                          editFtiRequests.map((request) => {
                            const isUsed = usedControlNos.has(request.controlNo);
                            return (
                              <SelectItem
                                key={request.controlNo}
                                value={request.controlNo}
                                disabled={isUsed}
                                className={isUsed ? "text-amber-600" : ""}
                              >
                                {request.controlNo}
                                {isUsed && " (Already linked)"}
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>

                    {editFtiControlNo && usedControlNos.has(editFtiControlNo) && (
                      <p className="text-xs font-medium text-amber-600">
                        ⚠ This FTI is already linked to another liquidation.
                        Each FTI can only be linked to one liquidation.
                      </p>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Select "No FTI (Other)" to clear the FTI linkage, or pick an
                  FTI request to link this liquidation to.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditFtiTarget(null);
                    setEditFtiControlNo("");
                    setUsedControlNos(new Set());
                  }}
                  disabled={editFtiSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEditFti}
                  disabled={
                    editFtiSaving ||
                    editFtiLoading ||
                    editFtiControlNo === (editFtiTarget.controlNo || "") ||
                    (editFtiControlNo !== "" && usedControlNos.has(editFtiControlNo))
                  }
                >
                  {editFtiSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Update Linkage
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Delete Liquidation
              </CardTitle>
              <CardDescription>
                This action <strong>cannot be undone</strong>. This will permanently
                delete the liquidation and all its receipt items from the database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="delete-confirm-input">
                Type <span className="font-bold text-red-600">delete</span> to
                confirm:
              </Label>
              <Input
                id="delete-confirm-input"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder='Type "delete" to confirm'
                disabled={deletingId === deleteTargetId}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteTargetId(null);
                    setDeleteConfirmInput("");
                  }}
                  disabled={deletingId === deleteTargetId}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    deleteConfirmInput.trim().toLowerCase() !== "delete" ||
                    deletingId === deleteTargetId
                  }
                  onClick={handleDeleteConfirm}
                >
                  {deletingId === deleteTargetId ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Loader2,
  ReceiptText,
  Eye,
  Trash2,
  Plus,
  ChevronDown,
  Pencil,
  ExternalLink,
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "sonner";
import { liquidationService } from "@/lib/services/liquidation.service";
import { miscellaneousService } from "@/lib/services/miscellaneous.service";
import { ftiService } from "@/lib/services/fti.service";
import { userService } from "@/lib/services/user.service";
import type { LiquidationFull } from "@/types/liquidation";
import type { FTIRequestFull } from "@/types/fti";
import { LiquidationForm } from "@/components/liquidation-form";
import LiquidationPreviewModal from "@/components/liquidation-preview-modal";
import LiquidationPrintDocument from "@/components/liquidation-print-document";
import FTIPreviewModal from "@/components/fti-preview-modal";

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

export function LiquidationList() {
  const [liquidations, setLiquidations] = useState<LiquidationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [storedUser] = useState<StoredUser>(getStoredUser);
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Preview modal state
  const [previewLiquidation, setPreviewLiquidation] =
    useState<LiquidationFull | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Lookup map for miscellaneous code → description
  const [miscLookup, setMiscLookup] = useState<Map<string, string>>(new Map());
  // Requester user IDs for which the current user is the mapped approver
  const [mappedRequesterIds, setMappedRequesterIds] = useState<Set<string>>(
    new Set(),
  );

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"fti" | "other">("fti");
  const [createInitialControlNo, setCreateInitialControlNo] = useState("");

  // Edit modal state (pre-populated LiquidationForm)
  const [editingLiquidation, setEditingLiquidation] =
    useState<LiquidationFull | null>(null);

  // FTI preview modal state (for clicking the ControlNo link)
  const [viewFtiRequest, setViewFtiRequest] = useState<FTIRequestFull | null>(
    null,
  );
  const [viewFtiModalOpen, setViewFtiModalOpen] = useState(false);
  // Resolved signature URL for old approved records that don't have one stored
  const [viewFtiSignatureUrl, setViewFtiSignatureUrl] = useState("");
  const [viewFtiRegenerating, setViewFtiRegenerating] = useState(false);

  // Resolved full name for the preview modal's Technician / Prepared by fields
  const [previewFullName, setPreviewFullName] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<LiquidationFull | null>(null);

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
    // Directly assigned approver (approvedByUserId was set on submit)
    if (liquidation.approvedByUserId === currentUserId) return true;
    // Fallback: mapped approver for the requester.
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

  // ── Preview → PDF / Image export (mirrors the FTI page flow) ──
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

  const openCreate = (mode: "fti" | "other", controlNo = "") => {
    setCreateMode(mode);
    setCreateInitialControlNo(controlNo);
    setCreateOpen(true);
  };

  const handleViewFti = async (controlNo: string) => {
    try {
      const full = await ftiService.getRequest(controlNo);
      setViewFtiRequest(full);

      // If the record has a signature URL stored, use it directly.
      // Otherwise try to resolve it from the Users sheet for old records.
      if (full.approvedBySignatureUrl) {
        setViewFtiSignatureUrl(full.approvedBySignatureUrl);
      } else if (full.approvedByName && full.approvedByUserId) {
        // Try to resolve signature by searching the Users sheet
        try {
          const users = await userService.getAllUsers();
          const approver = users.find(
            (u) => u.userId === full.approvedByUserId,
          );
          if (approver?.signature) {
            setViewFtiSignatureUrl(`/api/images/drive/${approver.signature}`);
          } else {
            // Fallback: try by username matching the approvedByName
            try {
              const sig = await userService.getSignatureByUsername(
                full.approvedByName,
              );
              if (sig?.imageUrl) {
                setViewFtiSignatureUrl(sig.imageUrl);
              }
            } catch {
              setViewFtiSignatureUrl("");
            }
          }
        } catch {
          setViewFtiSignatureUrl("");
        }
      } else {
        setViewFtiSignatureUrl("");
      }

      setViewFtiModalOpen(true);
    } catch {
      toast.error("Failed to load FTI details.");
    }
  };

  const handleRegenerateFtiPdf = async () => {
    if (!viewFtiRequest) return;
    setViewFtiRegenerating(true);
    try {
      // 1. Re-resolve signature if not already present
      let signatureUrl = viewFtiSignatureUrl;
      if (!signatureUrl && viewFtiRequest.approvedByName) {
        try {
          const sig = await userService.getSignatureByUsername(
            viewFtiRequest.approvedByName,
          );
          if (sig?.imageUrl) {
            signatureUrl = sig.imageUrl;
            setViewFtiSignatureUrl(signatureUrl);
          }
        } catch {
          // proceed without signature
        }
      }

      // 2. Pre-fetch the signature image as a data URL so html2canvas can
      //    render it without hitting the auth-required proxy endpoint.
      let signatureDataUrl = "";
      if (signatureUrl) {
        try {
          const imgRes = await fetch(signatureUrl);
          if (imgRes.ok) {
            const imgBlob = await imgRes.blob();
            signatureDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(imgBlob);
            });
            // Temporarily swap the src to the data URL so html2canvas sees it
            const imgElements = document.querySelectorAll<HTMLImageElement>(
              'img[alt="Approver Signature"]',
            );
            imgElements.forEach((img) => {
              img.dataset.originalSrc = img.src;
              img.src = signatureDataUrl;
            });
            // Wait for the swap to render
            await new Promise((r) => setTimeout(r, 100));
          }
        } catch {
          // proceed without signature
        }
      }

      // 3. Generate the PDF from the preview document
      const element = document.getElementById("fti-preview-content");
      if (!element) throw new Error("FTI preview document not found.");

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
      const blob = pdf.output("blob");

      // 4. Upload the regenerated PDF to Drive
      const fd = new FormData();
      fd.append("pdf", blob, `FTI_${viewFtiRequest.controlNo}.pdf`);
      fd.append("ftiRef", viewFtiRequest.controlNo);

      // Restore original image srcs before the await (so the UI snaps back)
      if (signatureDataUrl) {
        const imgElements = document.querySelectorAll<HTMLImageElement>(
          'img[alt="Approver Signature"]',
        );
        imgElements.forEach((img) => {
          if (img.dataset.originalSrc) {
            img.src = img.dataset.originalSrc;
          }
        });
      }
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
      const result = await res.json();

      // 5. Update the signature URL in the sheet if it was missing
      if (!viewFtiRequest.approvedBySignatureUrl && signatureUrl) {
        await ftiService.approveAction(
          viewFtiRequest.controlNo,
          "approve",
          "",
          result.fileLink,
          viewFtiRequest.approvedByName,
          signatureUrl,
        );
      }

      toast.success("PDF regenerated and saved to Drive successfully.");
      // Refresh the FTI request data to show updated file link
      const refreshed = await ftiService.getRequest(viewFtiRequest.controlNo);
      setViewFtiRequest(refreshed);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to regenerate PDF.",
      );
    } finally {
      setViewFtiRegenerating(false);
    }
  };

  // Resolve the full name for the preview modal's Technician / Prepared by fields.
  useEffect(() => {
    if (!previewLiquidation) {
      setPreviewFullName("");
      return;
    }
    const name = previewLiquidation.requesterName;
    if (name) {
      setPreviewFullName(name);
      return;
    }
    // Fallback: resolve from the user service
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
        setPreviewFullName(previewLiquidation.userId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewLiquidation]);

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

  const columns: ColumnDef<LiquidationFull>[] = [
    {
      accessorKey: "controlNo",
      header: "FTI Control No.",
      cell: ({ row }) =>
        row.original.controlNo ? (
          <Button
            variant="link"
            size="sm"
            className="font-mono text-blue-600 font-medium h-auto p-0"
            onClick={() => handleViewFti(row.original.controlNo)}
            title="View FTI details"
          >
            {row.original.controlNo}
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No FTI (Other)
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

  return (
    <div className="p-6 space-y-4">
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
        data={filteredLiquidations}
        loading={false}
        headerActions={createNewElement}
      />

      {/* Preview modal (with approval controls) */}
      <LiquidationPreviewModal
        open={previewLiquidation !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewLiquidation(null);
        }}
        controlNo={previewLiquidation?.controlNo || ""}
        fullName={previewFullName}
        items={
          previewLiquidation?.items?.map((item) => ({
            date: item.date,
            description: item.description,
            category: item.category,
            amount: item.amount,
            receiptImageUrl: item.receiptImageUrl || undefined,
          })) || []
        }
        categories={[...miscLookup.keys()]}
        miscLookup={miscLookup}
        advances={previewLiquidation?.totalAmountRequested || 0}
        onDownloadPdf={handleDownloadPdf}
        downloadingPdf={downloadingPdf}
        onDownloadImage={handleDownloadImage}
        downloadingImage={downloadingImage}
        approvalActions={
          previewLiquidation && canApprove(previewLiquidation)
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
                actionInProgress: approvingId === previewLiquidation.liquidationId,
              }
            : undefined
        }
        approvalComment={previewLiquidation?.approvalComment}
        approvalStatus={previewLiquidation?.status}
        approvedBy={previewLiquidation?.approvedByName}
        approvedBySignatureUrl={previewLiquidation?.approvedBySignatureUrl}
      />

      {/* Off-screen printable document for export */}
      <div className="fixed -left-[9999px] top-0" aria-hidden="true">
        <LiquidationPrintDocument
          controlNo={previewLiquidation?.controlNo || ""}
          fullName={previewFullName}
          items={
            previewLiquidation?.items?.map((item) => ({
              date: item.date,
              description: item.description,
              category: item.category,
              amount: item.amount,
              receiptImageUrl: item.receiptImageUrl || undefined,
            })) || []
          }
          categories={[...miscLookup.keys()]}
          miscLookup={miscLookup}
          advances={previewLiquidation?.totalAmountRequested || 0}
          id="liquidation-list-print-content"
          approvedBy={previewLiquidation?.approvedByName}
          approvedBySignatureUrl={previewLiquidation?.approvedBySignatureUrl}
        />
      </div>

      {/* FTI Preview Modal (clicking the ControlNo link) */}
      <FTIPreviewModal
        open={viewFtiModalOpen}
        onOpenChange={setViewFtiModalOpen}
        batchItems={
          viewFtiRequest?.details?.map((det) => {
            const miscAmount = det.expenses.reduce((s, e) => s + e.amount, 0);
            const miscExpenses = det.expenses.map((e) => ({
              code: e.miscCode,
              description: e.miscCode,
              amount: e.amount,
            }));
            return {
              id: det.detailId || crypto.randomUUID(),
              date: det.date,
              itinerary: det.itinerary,
              description: det.description,
              km: det.km,
              fuelPrice: det.fuelPrice,
              tollFee: det.tollFee,
              miscellaneous: det.expenses.map((e) => e.miscCode).join(", "),
              miscExpenses,
              miscAmount,
              fuelAmount: det.fuelSubTotal,
              totalAmount:
                det.fuelSubTotal +
                det.tollFee +
                miscAmount,
              origin: "AERICH INNOVATION CORP.",
              destinations: [],
            };
          }) || []
        }
        ftiRef={viewFtiRequest?.controlNo || ""}
        technician={viewFtiRequest?.userName || ""}
        fullName={viewFtiRequest?.userName || ""}
        readOnly
        approvalStatus={viewFtiRequest?.status}
        approvalComment={viewFtiRequest?.approvalComment}
        approvedBy={viewFtiRequest?.approvedByName}
        approvedBySignatureUrl={viewFtiSignatureUrl}
        onRegeneratePdf={
          viewFtiRequest?.status?.toUpperCase() === "APPROVED"
            ? handleRegenerateFtiPdf
            : undefined
        }
        regeneratingPdf={viewFtiRegenerating}
      />

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
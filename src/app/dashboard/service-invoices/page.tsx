"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EntityTable, ArrowUpDown } from "@/components/ui/entity-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Printer,
  Loader2,
  Eye,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import companyService from "@/lib/services/company.service";
import contractService from "@/lib/services/contract.service";
import deliveryService from "@/lib/services/delivery.service";
import userService from "@/lib/services/user.service";
import serviceInvoiceService from "@/lib/services/service-invoice.service";
import { ServiceInvoicePreviewModal } from "@/components/service-invoice-preview-modal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Badge } from "@/components/ui/badge";
import {
  ServiceInvoiceResponse,
  ServiceInvoiceSummary,
} from "@/types/serviceInvoice";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

const EMPTY_LINE_ITEM: LineItem = {
  description: "",
  quantity: 1,
  unitPrice: 0,
};

export default function ServiceInvoicesPage() {
  /* List state */
  const [invoices, setInvoices] = useState<ServiceInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  /* Reference data (customers only) */
  const [companies, setCompanies] = useState<any[]>([]);

  /* Create modal state */
  const [modalOpen, setModalOpen] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [preparedBy, setPreparedBy] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [printing, setPrinting] = useState(false);

  /* Linked DR */
  const [linkedDrNumber, setLinkedDrNumber] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [drOptions, setDrOptions] = useState<
    { value: string; label: string }[]
  >([]);

  /* Print / View preview modals */
  const [siResult, setSiResult] = useState<ServiceInvoiceResponse | null>(null);
  const [viewSi, setViewSi] = useState<ServiceInvoiceResponse | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  /* Edit modal state */
  const [editTarget, setEditTarget] = useState<ServiceInvoiceSummary | null>(
    null,
  );
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("created");
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  /* Delete */
  const [deleteTarget, setDeleteTarget] =
    useState<ServiceInvoiceSummary | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const data = await serviceInvoiceService.getAll();
      setInvoices(data);
    } catch (err) {
      console.error("Error loading service invoices:", err);
      toast.error("Failed to load service invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* Read DR prefill from sessionStorage (set by DR preview modal "Create SI" button) */
  useEffect(() => {
    (async () => {
      try {
        const raw = sessionStorage.getItem("siPrefill");
        if (!raw) return;
        sessionStorage.removeItem("siPrefill");
        const prefill = JSON.parse(raw);
        if (!prefill.drNumber) return;

        // Load DR options synchronously so the Linked DR dropdown is populated
        const allDrs = await deliveryService.getAll();
        setDrOptions(
          allDrs.map((d) => ({
            value: String(d.drNumber),
            label: `DR #${d.drNumber} — ${d.companyName} (${d.date})`,
          })),
        );

        setLinkedDrNumber(String(prefill.drNumber));
        if (prefill.companyName && companies.length > 0) {
          const match = companies.find(
            (c: any) => c.companyName === prefill.companyName,
          );
          if (match) setSelectedCustomer(match.companyId);
        }
        setModalOpen(true);
      } catch {
        /* ignore malformed */
      }
    })();
  }, [companies]);

  /* Load customers + current user for PreparedBy */
  useEffect(() => {
    (async () => {
      const all = await companyService.getAll();
      const customers = all.filter(
        (c) => c.companyType === "Customer" || c.companyType === "Both",
      );
      setCompanies(customers);

      try {
        const parsed = JSON.parse(
          window.localStorage.getItem("auth:user") || "{}",
        );
        const fullName = parsed.fullName || "";
        const username = parsed.userName || parsed.username || "";
        if (fullName) {
          setPreparedBy(fullName);
        } else if (username) {
          const name = await userService.getFullnameByUserName(username);
          setPreparedBy(name);
        }
      } catch {
        // ignore — PreparedBy remains empty and the user can type it
      }
    })();
  }, []);

  /* Derived options */
  const customerOptions = useMemo(
    () =>
      companies.map((c) => ({
        value: c.companyId,
        label: c.companyName,
      })),
    [companies],
  );

  /* Auto-populate PMS line item from active contract when customer selected */
  useEffect(() => {
    if (!selectedCustomer || !modalOpen) return;

    (async () => {
      try {
        // Also load DR options for the Linked DR dropdown
        const allDrs = await deliveryService.getAll();
        setDrOptions(
          allDrs.map((d) => ({
            value: String(d.drNumber),
            label: `DR #${d.drNumber} — ${d.companyName} (${d.date})`,
          })),
        );

        const contracts = await contractService.getAll();
        const matching = contracts.filter(
          (c) =>
            c.companyId === selectedCustomer &&
            c.status === "Active" &&
            c.monthlyServiceFee != null &&
            c.monthlyServiceFee > 0,
        );

        // Only auto-fill if exactly one contract has a service fee
        if (matching.length !== 1) return;

        const fee = matching[0].monthlyServiceFee!;
        const contractId = matching[0].id;

        // Build month label from invoiceDate (e.g., "AUGUST 2026")
        const d = new Date(
          invoiceDate + (invoiceDate.length === 10 ? "T00:00:00" : ""),
        );
        const monthLabel = isNaN(d.getTime())
          ? ""
          : d
              .toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })
              .toUpperCase();

        const desc = monthLabel
          ? `PMS FOR THE MONTH OF ${monthLabel}`
          : "PMS FOR THE MONTH";

        // Only auto-add a PMS item if none already exist (avoid duplicates)
        const alreadyHasPms = lineItems.some((li) =>
          li.description.toUpperCase().startsWith("PMS FOR THE MONTH"),
        );
        if (alreadyHasPms) return;

        setSelectedContractId(contractId);
        setLineItems((prev) => [
          ...prev,
          {
            description: desc,
            quantity: 1,
            unitPrice: fee,
          },
        ]);
      } catch {
        // non-fatal — contract lookup failed silently
      }
    })();
    // Intentionally only react to selectedCustomer changes, not invoiceDate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer, modalOpen]);

  /* Table columns */
  const columns: ColumnDef<ServiceInvoiceSummary>[] = useMemo(
    () => [
      {
        accessorKey: "invoiceNo",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Invoice No.
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">
            {String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ getValue }) => {
          const raw = String(getValue() ?? "");
          try {
            const d = new Date(raw + (raw.length === 10 ? "T00:00:00" : ""));
            return d.toLocaleDateString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          } catch {
            return raw;
          }
        },
      },
      {
        accessorKey: "companyName",
        header: "Customer",
      },
      {
        accessorKey: "preparedBy",
        header: "Prepared By",
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => {
          const total = row.original.items.reduce(
            (sum, i) => sum + (i.amount ?? i.quantity * i.unitPrice),
            0,
          );
          return (
            <span className="tabular-nums">
              {total.toLocaleString("en-PH", {
                style: "currency",
                currency: "PHP",
              })}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const s = String(getValue() ?? "created");
          const map: Record<
            string,
            {
              label: string;
              variant: "default" | "secondary" | "outline" | "destructive";
            }
          > = {
            created: { label: "Created", variant: "default" },
            draft: { label: "Draft", variant: "secondary" },
            paid: { label: "Paid", variant: "default" },
            void: { label: "Void", variant: "outline" },
            deleted: { label: "Deleted", variant: "destructive" },
          };
          const cfg = map[s] || map.created;
          return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const locked =
            row.original.status === "deleted" || row.original.status === "void";
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  setPreviewing(row.original.invoiceNo);
                  try {
                    const preview = await serviceInvoiceService.getPreview(
                      row.original.invoiceNo,
                    );
                    setViewSi(preview);
                  } catch {
                    toast.error("Failed to load invoice preview.");
                  } finally {
                    setPreviewing(null);
                  }
                }}
                disabled={previewing !== null}
                title="Preview"
              >
                {previewing === row.original.invoiceNo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              {row.original.driveFileLink && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-600 hover:text-blue-800"
                  onClick={() =>
                    window.open(row.original.driveFileLink, "_blank")
                  }
                  title="View PDF"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              {!locked && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditTarget(row.original)}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(row.original)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [previewing],
  );
  /* Create modal handlers */
  const openCreateModal = () => {
    setInvoiceNo("");
    setSelectedCustomer("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setLineItems([]);
    setLinkedDrNumber("");
    setSelectedContractId("");
    setModalOpen(true);
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { ...EMPTY_LINE_ITEM }]);
  };

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: string | number,
  ) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAndPrint = async () => {
    if (!invoiceNo.trim()) {
      toast.error("Invoice No. is required.");
      return;
    }
    if (!selectedCustomer) {
      toast.error("Please select a customer.");
      return;
    }
    if (!preparedBy.trim()) {
      toast.error("Prepared by is required.");
      return;
    }
    if (lineItems.length === 0) {
      toast.error("Please add at least one item.");
      return;
    }

    setPrinting(true);
    try {
      const payload = {
        invoiceNo: invoiceNo.trim(),
        date: invoiceDate,
        customerId: selectedCustomer,
        preparedBy,
        items: lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity) || 0,
          unitPrice: Number(li.unitPrice) || 0,
        })),
        contractId: selectedContractId || undefined,
        drNumber: linkedDrNumber ? parseInt(linkedDrNumber, 10) : undefined,
      };
      const res = await serviceInvoiceService.createAndPopulateSheet(payload);
      toast.success("Service invoice recorded!");
      setSiResult(res);
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to record invoice.",
      );
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!invoiceNo.trim()) {
      toast.error("Invoice No. is required.");
      return;
    }
    if (!selectedCustomer) {
      toast.error("Please select a customer.");
      return;
    }

    setDrafting(true);
    try {
      const payload = {
        invoiceNo: invoiceNo.trim(),
        date: invoiceDate,
        customerId: selectedCustomer,
        preparedBy: preparedBy || "",
        items: lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity) || 0,
          unitPrice: Number(li.unitPrice) || 0,
        })),
        status: "draft",
        contractId: selectedContractId || undefined,
        drNumber: linkedDrNumber ? parseInt(linkedDrNumber, 10) : undefined,
      };
      await serviceInvoiceService.createAndPopulateSheet(payload);
      toast.success("Service invoice saved as draft.");
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error || err?.message || "Failed to save draft.",
      );
    } finally {
      setDrafting(false);
    }
  };

  /* Delete handler */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await serviceInvoiceService.delete(deleteTarget.invoiceNo);
      toast.success(`Invoice ${deleteTarget.invoiceNo} deleted.`);
      setDeleteTarget(null);
      fetchList();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete service invoice.");
    } finally {
      setSubmitting(false);
    }
  };
  /* Populate edit form when target changes */
  useEffect(() => {
    if (editTarget) {
      setEditDate(editTarget.date);
      setEditStatus(editTarget.status || "created");
      setEditLineItems(
        editTarget.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );
    }
  }, [editTarget]);

  const addEditLineItem = () =>
    setEditLineItems((prev) => [...prev, { ...EMPTY_LINE_ITEM }]);
  const removeEditLineItem = (idx: number) =>
    setEditLineItems((prev) => prev.filter((_, i) => i !== idx));
  const updateEditLineItem = (
    idx: number,
    field: keyof LineItem,
    value: string | number,
  ) =>
    setEditLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );

  /* Edit save handler */
  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSubmitting(true);
    try {
      const payload = {
        date: editDate,
        status: editStatus,
        items: editLineItems
          .filter((li) => li.description.trim())
          .map((li) => ({
            description: li.description,
            quantity: Number(li.quantity) || 0,
            unitPrice: Number(li.unitPrice) || 0,
          })),
      };
      await serviceInvoiceService.update(editTarget.invoiceNo, payload);
      toast.success(`Invoice ${editTarget.invoiceNo} updated.`);

      // Regenerate PDF for the updated invoice (skip for drafts)
      if (editStatus !== "draft") {
        serviceInvoiceService
          .savePdfToDrive(
            editTarget.invoiceNo,
            editTarget.companyName,
            editDate,
          )
          .catch(() => {
            // PDF regen is best-effort — don't block the update flow
          });
      }

      setEditTarget(null);
      fetchList();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to update invoice.",
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-6 space-y-6">
        <EntityTable
          title="Service Invoices"
          columns={columns}
          data={invoices}
          loading={loading}
          onCreateNew={openCreateModal}
        />
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Create Service Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Row 1: Invoice No., Customer, Date */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="space-y-2 md:col-span-3">
                <Label>
                  Invoice No. <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="From the paper invoice"
                />
              </div>
              <div className="space-y-1.5 md:col-span-6">
                <Label>
                  Customer Name <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={selectedCustomer}
                  onValueChange={setSelectedCustomer}
                  options={customerOptions}
                  placeholder="Select Customer"
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            {/* Items Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">Items</Label>
                <Button size="sm" variant="outline" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    className="flex-1 min-w-[200px] uppercase"
                    value={item.description}
                    placeholder="DESCRIPTION (in all caps)"
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "description",
                        e.target.value.toUpperCase(),
                      )
                    }
                  />
                  <Input
                    className="w-24 shrink-0"
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "quantity",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <Input
                    className="w-28 shrink-0"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "unitPrice",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <div className="w-28 shrink-0 text-right tabular-nums text-sm text-muted-foreground">
                    {(item.quantity * item.unitPrice).toLocaleString("en-PH", {
                      style: "currency",
                      currency: "PHP",
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={() => removeLineItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Prepared By and Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prepared By</Label>
                <Input
                  value={preparedBy}
                  readOnly
                  className="bg-muted"
                  placeholder="Auto-filled from your profile"
                />
              </div>
              <div className="space-y-1.5 w-full">
                <Label>Linked DR (optional)</Label>
                <SearchableSelect
                  value={linkedDrNumber}
                  onValueChange={setLinkedDrNumber}
                  options={drOptions}
                  placeholder="Select Delivery Receipt"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={drafting || printing}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={drafting || printing}
            >
              {drafting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save as Draft
            </Button>
            <Button
              onClick={handleSaveAndPrint}
              disabled={drafting || printing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {printing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Save &amp; Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Invoice Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
      >
        <DialogContent
          className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              Edit Service Invoice #{editTarget?.invoiceNo}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Row 1: Customer (read-only), Date, Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Input
                  value={editTarget?.companyName ?? ""}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created">Created</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">Items</Label>
                <Button size="sm" variant="outline" onClick={addEditLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {editLineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    className="flex-1 min-w-[200px] uppercase"
                    value={item.description}
                    placeholder="DESCRIPTION (in all caps)"
                    onChange={(e) =>
                      updateEditLineItem(
                        idx,
                        "description",
                        e.target.value.toUpperCase(),
                      )
                    }
                  />
                  <Input
                    className="w-24 shrink-0"
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateEditLineItem(
                        idx,
                        "quantity",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <Input
                    className="w-28 shrink-0"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateEditLineItem(
                        idx,
                        "unitPrice",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <div className="w-28 shrink-0 text-right tabular-nums text-sm text-muted-foreground">
                    {(item.quantity * item.unitPrice).toLocaleString("en-PH", {
                      style: "currency",
                      currency: "PHP",
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={() => removeEditLineItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSubmitting}>
              {editSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Modal */}
      <ServiceInvoicePreviewModal
        si={viewSi}
        open={!!viewSi}
        onOpenChange={(v) => {
          if (!v) setViewSi(null);
        }}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        description={`Delete service invoice "${deleteTarget?.invoiceNo}"? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

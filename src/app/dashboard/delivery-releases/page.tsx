"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
  Plus,
  Trash2,
  Printer,
  Loader2,
  Eye,
  Pencil,
  ExternalLink,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import companyService from "@/lib/services/company.service";
import productService from "@/lib/services/product.service";
import productCategoryService from "@/lib/services/product-category.service";
import contractService from "@/lib/services/contract.service";
import deliveryService from "@/lib/services/delivery.service";
import serviceInvoiceService from "@/lib/services/service-invoice.service";
import userService from "@/lib/services/user.service";
import contractItemService from "@/lib/services/contract-item.service";
import { DeliveryReceiptPreviewModal } from "@/components/delivery-receipt-preview-modal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DeliveryReceiptResponse,
  DeliveryReceiptSummary,
} from "@/types/deliveryReceipt";
import { ProductCategory } from "@/types/product-category";

interface LineItem {
  productCode: string;
  unit: string;
  description: string;
  quantity: number;
}

const EMPTY_LINE_ITEM: LineItem = {
  productCode: "",
  unit: "PC",
  description: "",
  quantity: 1,
};

export default function DeliveryReleasePage() {
  /* List state */
  const [receipts, setReceipts] = useState<DeliveryReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);

  /* Reference data (shared) */
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>(
    [],
  );
  const [drivers, setDrivers] = useState<string[]>([]);

  /* SI lookup: drNumber → list of linked ServiceInvoice summaries */
  const [siLookup, setSiLookup] = useState<Map<number, any[]>>(new Map());

  /* Create modal state */
  const [modalOpen, setModalOpen] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [poNo, setPoNo] = useState("");
  const [trNo, setTrNo] = useState("");
  const [drNo, setDrNo] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [comments, setComments] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [printing, setPrinting] = useState(false);

  /* Manual-entry toggle: Set<row index> for rows in free-text mode */
  const [manualRows, setManualRows] = useState<Set<number>>(new Set());

  /* Print / View preview modals */
  const [drResult, setDrResult] = useState<DeliveryReceiptResponse | null>(
    null,
  );
  const [viewDr, setViewDr] = useState<DeliveryReceiptResponse | null>(null);

  const [previewingDr, setPreviewingDr] = useState<number | null>(null);

  /* Quick Add Product state */
  const [quickAddProductOpen, setQuickAddProductOpen] = useState(false);
  const [quickAddCategoryId, setQuickAddCategoryId] = useState("");
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddUnit, setQuickAddUnit] = useState("PC");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddContext, setQuickAddContext] = useState<{
    mode: "create" | "edit";
    index: number;
  } | null>(null);

  /* Edit / Delete state */
  const [editTarget, setEditTarget] = useState<DeliveryReceiptSummary | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<DeliveryReceiptSummary | null>(null);

  /* Edit modal form state */
  const [editDate, setEditDate] = useState("");
  const [editPoNo, setEditPoNo] = useState("");
  const [editTrNo, setEditTrNo] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editDeliveredBy, setEditDeliveredBy] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  /* Manual-entry toggle for edit modal */
  const [editManualRows, setEditManualRows] = useState<Set<number>>(new Set());

  /* Fetch list + reference data */
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await deliveryService.getAll();
      setReceipts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* Pre-fill from Contract Releases page */
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("fromRelease") !== "true") return;

    try {
      const raw = sessionStorage.getItem("deliveryReleasePrefill");
      if (!raw) return;
      const prefill = JSON.parse(raw);
      sessionStorage.removeItem("deliveryReleasePrefill");

      if (prefill.companyId) {
        setSelectedCompany(prefill.companyId);
      }
      if (prefill.items && prefill.items.length > 0) {
        setLineItems(
          prefill.items.map((item: any) => ({
            productCode: item.productCode || "",
            unit: item.unit || "PC",
            description: item.description || "",
            quantity: item.quantity || 1,
          })),
        );
      }
      setModalOpen(true);
    } catch {
      // ignore — malformed sessionStorage data
    }
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      companyService.getAll(),
      productService.getAll(),
      deliveryService.getDrivers(),
      productCategoryService.getAll(),
    ]).then(([cData, pData, dData, catData]) => {
      setCompanies(Array.isArray(cData) ? cData : []);
      setProducts(Array.isArray(pData) ? pData : []);
      setDrivers(Array.isArray(dData) ? dData : []);
      setProductCategories(Array.isArray(catData) ? catData : []);
    });

    // Fetch SIs and build drNumber→SI lookup
    serviceInvoiceService.getAll().then((sis) => {
      const map = new Map<number, any[]>();
      for (const si of sis) {
        if (!si.drNumber) continue;
        const list = map.get(si.drNumber) || [];
        list.push(si);
        map.set(si.drNumber, list);
      }
      setSiLookup(map);
    }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const raw = window.localStorage.getItem("auth:user");
        if (raw) {
          const parsed = JSON.parse(raw);
          const username = parsed.userName || "";
          if (username) {
            const fullName = await userService.getFullnameByUserName(username);
            setPreparedBy(fullName);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fetch contract entitlements (items) when company changes in modal
  useEffect(() => {
    if (!selectedCompany) {
      setContracts([]);
      return;
    }
    (async () => {
      try {
        const companyContracts =
          await contractService.getByCompanyId(selectedCompany);
        if (!companyContracts.length) {
          setContracts([]);
          return;
        }

        const allItems = await contractItemService.getAll();
        const contractIds = new Set(companyContracts.map((c) => c.id));
        const companyItems = allItems.filter((item) =>
          contractIds.has(item.contractId),
        );

        const mapped = companyItems.map((item) => ({
          productName: productNameByCode[item.productCode] || item.productCode,
          entitledQty: item.entitledQty,
          unit: "",
          frequency: item.frequency,
          releasedThisPeriod: 0,
          productCode: item.productCode,
          contractId: item.contractId,
        }));

        setContracts(mapped);
      } catch {
        setContracts([]);
      }
    })();
  }, [selectedCompany]);

  /* Derived options */
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.companyId, label: c.companyName })),
    [companies],
  );

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.code, label: p.name })),
    [products],
  );

  const categoryOptions = useMemo(
    () =>
      productCategories.map((c) => ({ value: String(c.id), label: c.name })),
    [productCategories],
  );

  const productNameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    products.forEach((p) => {
      map[p.code] = p.name;
    });
    return map;
  }, [products]);

  const driverOptions = useMemo(
    () => drivers.map((d) => ({ value: d, label: d })),
    [drivers],
  );

  /* Table columns */
  const columns: ColumnDef<DeliveryReceiptSummary>[] = useMemo(
    () => [
      {
        accessorKey: "drNumber",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            DR No.
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ getValue }) => {
          const val = Number(getValue());
          if (val <= 0) return <span className="text-muted-foreground italic">Draft</span>;
          return (
            <span className="font-semibold tabular-nums">
              {String(getValue())}
            </span>
          );
        },
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
        id: "itemCount",
        header: "Items",
        cell: ({ row }) => `${row.original.items?.length ?? 0} item(s)`,
      },
      {
        id: "linkedSIs",
        header: "Linked SIs",
        cell: ({ row }) => {
          const linked = siLookup.get(row.original.drNumber);
          if (!linked || linked.length === 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {linked.map((si: any) => (
                <span
                  key={si.invoiceNo}
                  className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono"
                >
                  {si.invoiceNo}
                </span>
              ))}
            </div>
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
            draft: { label: "Draft", variant: "outline" },
            created: { label: "Created", variant: "secondary" },
            printed: { label: "Printed", variant: "default" },
            completed: { label: "Completed", variant: "default" },
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
          const locked = ["completed", "deleted"].includes(
            row.original.status,
          );
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  setPreviewingDr(row.original.drNumber);
                  try {
                    const preview = await deliveryService.getPreview(
                      row.original.drNumber,
                    );
                    setViewDr(preview);
                  } catch {
                    toast.error("Failed to load DR preview.");
                  } finally {
                    setPreviewingDr(null);
                  }
                }}
                disabled={previewingDr !== null}
                title="Preview"
              >
                {previewingDr === row.original.drNumber ? (
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
    [previewingDr, siLookup],
  );

  /* Create modal handlers */
  const openCreateModal = () => {
    setSelectedCompany("");
    setDeliveryDate(new Date().toISOString().split("T")[0]);
    setDrNo("");
    setPoNo("");
    setTrNo("");
    setDeliveredBy("");
    setComments("");
    setLineItems([]);
    setManualRows(new Set());
    setContracts([]);
    setModalOpen(true);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { ...EMPTY_LINE_ITEM }]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    if (field === "productCode") {
      const prod = products.find((p) => p.code === value);
      updated[index] = {
        ...updated[index],
        productCode: value,
        unit: prod?.unit?.code || "PC",
        description: prod?.name || "",
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
    setManualRows((prev) => {
      const next = new Set(prev);
      next.delete(index);
      // re-index: decrement all indices above the removed one
      const updated = new Set<number>();
      for (const v of next) updated.add(v > index ? v - 1 : v);
      return updated;
    });
  };

  const handleSaveAndPrint = async () => {
    if (!preparedBy.trim()) {
      toast.error("Prepared by is required.");
      return;
    }
    if (!deliveredBy.trim()) {
      toast.error("Delivered by is required.");
      return;
    }
    if (!selectedCompany || lineItems.length === 0 || !lineItems.some((li) => li.productCode || li.description.trim())) {
      toast.error("Please select a customer and add at least one valid item.");
      return;
    }

    setPrinting(true);
    try {
      const payload = {
        companyId: selectedCompany,
        date: deliveryDate,
        drNumber: drNo ? parseInt(drNo, 10) : undefined,
        poNo,
        trNo,
        preparedBy,
        deliveredBy,
        comments,
        items: lineItems,
        status: "printed",
      };

      const res = await deliveryService.createAndPopulateSheet(payload);
      toast.success("Delivery receipt recorded!");

      // ── Trigger contract releases for matching contract items ──
      const drNumber = res.drNumber;
      if (contracts.length > 0 && drNumber) {
        try {
          const { default: contractReleaseService } = await import(
            "@/lib/services/contractRelease.service"
          );
          const validRows = lineItems.filter((li) => li.productCode);
          for (const row of validRows) {
            const matchingContract = contracts.find(
              (c: any) => c.productCode === row.productCode && c.contractId,
            );
            if (matchingContract?.contractId) {
              const contractItems =
                await contractItemService.getByContractId(
                  matchingContract.contractId,
                );
              const matchingItem = contractItems.find(
                (ci: any) => ci.productCode === row.productCode && ci.status === "Active",
              );
              if (matchingItem) {
                await contractReleaseService
                  .processRelease(
                    matchingItem.id,
                    row.quantity,
                    deliveryDate,
                    preparedBy,
                    comments || undefined,
                    matchingContract.contractId,
                    row.productCode,
                    drNumber,
                  )
                  .catch(() => {
                    // non-fatal — release processing is best-effort
                  });
              }
            }
          }
        } catch {
          // non-fatal — contract release is best-effort during DR creation
        }
      }

      setDrResult(res);
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to process delivery receipt.");
    } finally {
      setPrinting(false);
    }
  };

  /* Save Draft handler */
  const handleSaveDraft = async () => {
    if (!selectedCompany) {
      toast.error("Please select a customer.");
      return;
    }
    setDrafting(true);
    try {
      const payload = {
        companyId: selectedCompany,
        date: deliveryDate,
        drNumber: drNo ? parseInt(drNo, 10) : undefined,
        poNo,
        trNo,
        preparedBy: preparedBy || "",
        deliveredBy: deliveredBy || "",
        comments,
        items: lineItems,
        status: "draft",
      };
      await deliveryService.createAndPopulateSheet(payload);
      toast.success("Delivery receipt saved as draft.");
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to save draft.");
    } finally {
      setDrafting(false);
    }
  };

  /* Quick Add Product handlers */
  const handleOpenQuickAddProduct = (
    searchText: string,
    mode: "create" | "edit",
    index: number,
  ) => {
    setQuickAddCategoryId("");
    setQuickAddName(searchText || "");
    setQuickAddUnit("PC");
    setQuickAddContext({ mode, index });
    setQuickAddProductOpen(true);
  };

  const handleQuickAddSave = async () => {
    if (!quickAddName.trim()) {
      toast.error("Product Name is required.");
      return;
    }
    if (!quickAddCategoryId) {
      toast.error("Please select a product category.");
      return;
    }
    setQuickAddSaving(true);
    try {
      const category = productCategories.find(
        (c) => String(c.id) === quickAddCategoryId,
      ) || {
        id: quickAddCategoryId,
        code: "",
        name: quickAddCategoryId,
      };

      const created = await productService.create({
        code: "",
        name: quickAddName.trim(),
        category,
        description: "",
        unit: { id: quickAddUnit, code: quickAddUnit, name: quickAddUnit },
        costPerUnit: 0,
        pricePerUnit: 0,
        supplier: {
          id: "",
          row: 0,
          companyId: "",
          companyType: "Supplier",
          companyName: "",
          tin: "",
          address: "",
          latitude: undefined,
          longitude: undefined,
          status: "active",
        },
      });

      const pData = await productService.getAll();
      setProducts(Array.isArray(pData) ? pData : []);

      // Auto-select the newly added product in the originating line item.
      if (quickAddContext) {
        const code = created?.code || "";
        const unit = created?.unit?.code || quickAddUnit;
        const description =
          created?.name || created?.description || quickAddName.trim();

        if (quickAddContext.mode === "create") {
          setLineItems((prev) =>
            prev.map((item, i) =>
              i === quickAddContext.index
                ? { ...item, productCode: code, unit, description }
                : item,
            ),
          );
        } else {
          setEditLineItems((prev) =>
            prev.map((item, i) =>
              i === quickAddContext.index
                ? { ...item, productCode: code, unit, description }
                : item,
            ),
          );
        }
      }

      toast.success(`Product "${quickAddName.trim()}" added.`);
      setQuickAddProductOpen(false);
      setQuickAddContext(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add product.");
    } finally {
      setQuickAddSaving(false);
    }
  };

  /* Delete handler */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deliveryService.delete(deleteTarget.drNumber);
      toast.success(
        deleteTarget.drNumber > 0
          ? `DR #${deleteTarget.drNumber} deleted.`
          : `Draft DR deleted.`,
      );
      setDeleteTarget(null);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete delivery receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  /* Populate edit form when target changes */
  useEffect(() => {
    if (editTarget) {
      setEditDate(editTarget.date);
      setEditPoNo(editTarget.poNo);
      setEditTrNo(editTarget.trNo);
      setEditComments(editTarget.comments);
      setEditDeliveredBy(editTarget.deliveredBy);
      setEditStatus(editTarget.status || "created");
      setEditLineItems(
        editTarget.items.map((item) => ({
          productCode: item.productCode,
          unit: item.unit,
          description: item.description,
          quantity: item.quantity,
        })),
      );
      // Pre-populate manual rows for items that have description but no productCode
      const manual = new Set<number>();
      editTarget.items.forEach((item, i) => {
        if (!item.productCode && item.description?.trim()) manual.add(i);
      });
      setEditManualRows(manual);
    }
  }, [editTarget]);

  /* Edit line item helpers */
  const addEditLineItem = () =>
    setEditLineItems((prev) => [...prev, { ...EMPTY_LINE_ITEM }]);
  const removeEditLineItem = (idx: number) => {
    setEditLineItems((prev) => prev.filter((_, i) => i !== idx));
    setEditManualRows((prev) => {
      const updated = new Set<number>();
      for (const v of prev) updated.add(v > idx ? v - 1 : v);
      return updated;
    });
  };
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
        poNo: editPoNo,
        trNo: editTrNo,
        comments: editComments,
        deliveredBy: editDeliveredBy,
        status: editStatus,
        items: editLineItems
          .filter((li) => li.productCode || li.description.trim())
          .map((li) => ({
            productCode: li.productCode,
            unit: li.unit,
            description: li.description,
            quantity: li.quantity,
          })),
      };
      await deliveryService.update(editTarget.drNumber, payload);
      toast.success(
        editTarget.drNumber > 0
          ? `DR #${editTarget.drNumber} updated.`
          : `Draft DR updated.`,
      );

      // Regenerate PDF for the updated DR (skip for drafts)
      if (editStatus !== "draft") {
        deliveryService
          .savePdfToDrive(editTarget.drNumber, editTarget.companyName, editDate)
          .catch(() => {
            // PDF regen is best-effort — don't block the update flow
          });
      }

      setEditTarget(null);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to update delivery receipt.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-6 space-y-6">
        <EntityTable
          title="Delivery Receipts"
          columns={columns}
          data={receipts}
          loading={loading}
          onCreateNew={openCreateModal}
        />
      </div>

      {/* Create DR Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Create Delivery Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Row 1: Customer Name (6 cols), DR No. (3 cols), Date (3 cols) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="space-y-1.5 md:col-span-6">
                <Label>
                  Customer Name <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={selectedCompany}
                  onValueChange={setSelectedCompany}
                  options={companyOptions}
                  placeholder="Select Customer"
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>DR No. (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  value={drNo}
                  onChange={(e) => setDrNo(e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (!val) return;
                    const num = parseInt(val, 10);
                    if (isNaN(num) || num <= 0) return;
                    const existing = receipts.filter((r) => r.drNumber > 0);
                    if (existing.some((r) => r.drNumber === num)) {
                      toast.error(`DR #${num} already exists.`);
                      setDrNo("");
                    }
                  }}
                  placeholder="Auto-generated"
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: PO NO. and TR# */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PO NO.</Label>
                <Input
                  value={poNo}
                  onChange={(e) => setPoNo(e.target.value)}
                  placeholder="e.g. PO-10293"
                />
              </div>
              <div className="space-y-2">
                <Label>TR#</Label>
                <Input
                  value={trNo}
                  onChange={(e) => setTrNo(e.target.value)}
                  placeholder="e.g. TR-8841"
                />
              </div>
            </div>

            {/* Products Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">
                  Products / Consumables
                </Label>
                <Button size="sm" variant="outline" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  {manualRows.has(idx) ? (
                    /* Free-text manual entry */
                    <>
                      <Input
                        className="flex-1 min-w-[200px]"
                        value={item.description}
                        onChange={(e) =>
                          updateLineItem(idx, "description", e.target.value)
                        }
                        placeholder="Type item name / description"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        title="Switch to product selector"
                        onClick={() => {
                          setManualRows((prev) => {
                            const next = new Set(prev);
                            next.delete(idx);
                            return next;
                          });
                        }}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    /* Product selector */
                    <>
                      <div className="flex-1 min-w-[200px]">
                        <SearchableSelect
                          value={item.productCode}
                          onValueChange={(v) =>
                            updateLineItem(idx, "productCode", v)
                          }
                          options={productOptions}
                          placeholder="Select Product"
                          onAddOption={(searchText) =>
                            handleOpenQuickAddProduct(searchText, "create", idx)
                          }
                          addOptionLabel="+ Add Product"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        title="Type manually"
                        onClick={() => {
                          setManualRows((prev) => new Set(prev).add(idx));
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Input
                    value={item.unit}
                    onChange={(e) =>
                      updateLineItem(idx, "unit", e.target.value)
                    }
                    placeholder="Unit"
                    readOnly={!manualRows.has(idx)}
                    className={manualRows.has(idx) ? "w-20 shrink-0" : "w-20 shrink-0 bg-muted text-muted-foreground"}
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
                        parseInt(e.target.value) || 1,
                      )
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive shrink-0"
                    onClick={() => removeLineItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Row 3: Prepared By and Delivered By */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Prepared By <span className="text-destructive">*</span>
                </Label>
                <Input value={preparedBy} readOnly placeholder="Full name" />
              </div>
              <div className="space-y-1.5 w-full">
                <Label>
                  Delivered By <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={deliveredBy}
                  onValueChange={setDeliveredBy}
                  options={driverOptions}
                  placeholder="Select Personnel"
                />
              </div>
            </div>

            {/* Row 4: Comments */}
            <div className="space-y-2">
              <Label>Comments / Special Instructions</Label>
              <Textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="e.g. MONTHLY PMS FOR THE MONTH OF AUGUST"
              />
            </div>

            {/* Entitlements Card */}
            {selectedCompany && contracts.length > 0 && (
              <Card>
                <CardContent className="pt-4 space-y-2">
                  {contracts.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 border rounded-lg space-y-1 bg-muted/40 text-sm"
                    >
                      <div className="font-semibold text-primary">
                        {c.productName}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          Entitled: {c.entitledQty} {c.unit} / {c.frequency}
                        </span>
                        <span>Released: {c.releasedThisPeriod}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
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
              {drafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Draft
            </Button>
            <Button onClick={handleSaveAndPrint} disabled={drafting || printing}>
              {printing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Save &amp; Print Delivery Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Modal (after creation) */}
      <DeliveryReceiptPreviewModal
        dr={drResult}
        open={!!drResult}
        onOpenChange={(v) => {
          if (!v) setDrResult(null);
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete Delivery Receipt"
        description={`Are you sure you want to delete DR ${deleteTarget && deleteTarget.drNumber > 0 ? `#${deleteTarget.drNumber}` : "Draft"}? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Edit DR Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null);
        }}
      >
        <DialogContent
          className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {editTarget && editTarget.drNumber > 0
                ? `Edit DR #${editTarget.drNumber}`
                : `Edit Draft DR`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Row 1: Customer Name and Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Input
                  value={editTarget?.companyName ?? ""}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: PO NO. and TR# */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PO NO.</Label>
                <Input
                  value={editPoNo}
                  onChange={(e) => setEditPoNo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>TR#</Label>
                <Input
                  value={editTrNo}
                  onChange={(e) => setEditTrNo(e.target.value)}
                />
              </div>
            </div>

            {/* Products Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">
                  Products / Consumables
                </Label>
                <Button size="sm" variant="outline" onClick={addEditLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>
              {editLineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  {editManualRows.has(idx) ? (
                    <>
                      <Input
                        className="flex-1 min-w-[200px]"
                        value={item.description}
                        onChange={(e) =>
                          updateEditLineItem(idx, "description", e.target.value)
                        }
                        placeholder="Type item name / description"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        title="Switch to product selector"
                        onClick={() =>
                          setEditManualRows((prev) => {
                            const next = new Set(prev);
                            next.delete(idx);
                            return next;
                          })
                        }
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-[200px]">
                        <SearchableSelect
                          value={item.productCode}
                          onValueChange={(v) =>
                            updateEditLineItem(idx, "productCode", v)
                          }
                          options={productOptions}
                          placeholder="Select Product"
                          onAddOption={(searchText) =>
                            handleOpenQuickAddProduct(searchText, "edit", idx)
                          }
                          addOptionLabel="+ Add Product"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        title="Type manually"
                        onClick={() =>
                          setEditManualRows(
                            (prev) => new Set(prev).add(idx),
                          )
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Input
                    className="w-24 shrink-0"
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateEditLineItem(
                        idx,
                        "quantity",
                        parseInt(e.target.value) || 0,
                      )
                    }
                  />
                  <Input
                    value={item.unit}
                    onChange={(e) =>
                      updateEditLineItem(idx, "unit", e.target.value)
                    }
                    readOnly={!editManualRows.has(idx)}
                    className={editManualRows.has(idx) ? "w-16 shrink-0" : "w-16 shrink-0 bg-muted text-muted-foreground"}
                  />
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

            {/* Prepared By and Delivered By */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prepared By</Label>
                <Input
                  value={editTarget?.preparedBy ?? ""}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-1.5 w-full">
                <Label>
                  Delivered By <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={editDeliveredBy}
                  onValueChange={setEditDeliveredBy}
                  options={driverOptions}
                  placeholder="Select Personnel"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="printed">Printed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <Label>Comments / Special Instructions</Label>
              <Textarea
                rows={3}
                value={editComments}
                onChange={(e) => setEditComments(e.target.value)}
              />
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

      {/* View DR Modal */}
      <DeliveryReceiptPreviewModal
        dr={viewDr}
        open={!!viewDr}
        onOpenChange={(v) => {
          if (!v) setViewDr(null);
        }}
      />

      {/* Quick Add Product Dialog */}
      <Dialog open={quickAddProductOpen} onOpenChange={setQuickAddProductOpen}>
        <DialogContent
          className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product Code</Label>
              <Input
                value="Auto-Generated"
                disabled
                placeholder="Auto-Generated"
              />
            </div>
            <div className="space-y-1.5 w-full">
              <Label>
                Product Category <span className="text-destructive">*</span>
              </Label>
              <SearchableSelect
                value={quickAddCategoryId}
                onValueChange={setQuickAddCategoryId}
                options={categoryOptions}
                placeholder="Select category"
                searchPlaceholder="Search categories..."
              />
            </div>
            <div className="space-y-2">
              <Label>
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                placeholder="e.g. Printer Ink"
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input
                value={quickAddUnit}
                onChange={(e) => setQuickAddUnit(e.target.value)}
                placeholder="e.g. PC"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuickAddProductOpen(false)}
              disabled={quickAddSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleQuickAddSave} disabled={quickAddSaving}>
              {quickAddSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

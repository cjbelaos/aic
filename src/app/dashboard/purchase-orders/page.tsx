"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import companyService from "@/lib/services/company.service";
import productService from "@/lib/services/product.service";
import supplierProductV2Service from "@/lib/services/supplier-product-v2.service";
import type { SupplierProductV2 } from "@/types/supplier-product";
import productUnitService from "@/lib/services/product-unit.service";
import productCategoryService from "@/lib/services/product-category.service";
import userService from "@/lib/services/user.service";
import purchaseOrderService from "@/lib/services/purchase-order.service";
import paymentTermService from "@/lib/services/payment-term.service";
import type { PaymentTerm } from "@/types/paymentTerm";
import { generatePurchaseOrderPdfBase64 } from "@/lib/purchaseOrderPdf";
import { PurchaseOrderPreviewModal } from "@/components/purchase-order-preview-modal";
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
  PurchaseOrderResponse,
  PurchaseOrderSummary,
  PurchaseOrderItem,
} from "@/types/purchaseOrder";
import { ProductCategory } from "@/types/product-category";
import { ProductUnit } from "@/types/product-unit";

interface LineItem {
  itemNo: number;
  productCode: string;
  productId: string;
  supplierProductId: string;
  unit: string;
  description: string;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
}

const EMPTY_LINE_ITEM: LineItem = {
  itemNo: 1,
  productCode: "",
  productId: "",
  supplierProductId: "",
  unit: "PC",
  description: "",
  quantity: 1,
  pricePerUnit: 0,
  totalAmount: 0,
};

export default function PurchaseOrderPage() {
  /* List state */
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  /* Reference data */
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierIdsWithItems, setSupplierIdsWithItems] = useState<Set<string>>(
    new Set(),
  );
  const [products, setProducts] = useState<any[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductV2[]>([]);
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>(
    [],
  );

  /* Create modal state */
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [prNumber, setPrNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poNumberMode, setPoNumberMode] = useState<"automatic" | "manual">("automatic");
  const [isAdmin, setIsAdmin] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [notedBy, setNotedBy] = useState("");
  const [comments, setComments] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentTermOptions, setPaymentTermOptions] = useState<PaymentTerm[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [printing, setPrinting] = useState(false);

  /* Manual-entry toggle */
  const [manualRows, setManualRows] = useState<Set<number>>(new Set());

  /* Preview modals */
  const [poResult, setPoResult] = useState<PurchaseOrderResponse | null>(null);
  const [viewPo, setViewPo] = useState<PurchaseOrderResponse | null>(null);
  const [previewingPo, setPreviewingPo] = useState<string | null>(null);

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
  const [editTarget, setEditTarget] = useState<PurchaseOrderSummary | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrderSummary | null>(
    null,
  );

  /* Edit modal form state */
  const [editDate, setEditDate] = useState("");
  const [editPrNumber, setEditPrNumber] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editDeliveryDate, setEditDeliveryDate] = useState("");
  const [editPaymentTerms, setEditPaymentTerms] = useState("");
  const [editApprovedBy, setEditApprovedBy] = useState("");
  const [editNotedBy, setEditNotedBy] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPONumberMode, setEditPONumberMode] = useState<"automatic" | "manual">("automatic");
  const [editPONumber, setEditPONumber] = useState("");
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  /* Manual-entry toggle for edit modal */
  const [editManualRows, setEditManualRows] = useState<Set<number>>(new Set());

  /* View items dialog */
  const [viewItemsTarget, setViewItemsTarget] =
    useState<PurchaseOrderSummary | null>(null);

  const router = useRouter();

  /* Fetch list */
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await purchaseOrderService.getAll();
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* Load reference data */
  useEffect(() => {
    Promise.all([
      companyService.getAll(),
      productService.getAll(),
      productUnitService.getAll(),
      productCategoryService.getAll(),
      paymentTermService.getAll(),
      supplierProductV2Service.getAll({ status: "active" }),
    ]).then(([cData, pData, uData, catData, termsData, offerings]) => {
      // Filter only suppliers
      const suppliers = Array.isArray(cData)
        ? cData.filter(
            (c) => c.companyType === "Supplier" || c.companyType === "Both",
          )
        : [];
      setSuppliers(suppliers);
      setSupplierIdsWithItems(
        new Set((offerings ?? []).map((offering) => offering.supplierId)),
      );
      setProducts(Array.isArray(pData) ? pData : []);
      setProductUnits(Array.isArray(uData) ? uData : []);
      setProductCategories(Array.isArray(catData) ? catData : []);
      setPaymentTermOptions((termsData ?? []).filter((term) => term.status === "Active"));
    });

    (async () => {
      try {
        const raw = window.localStorage.getItem("auth:user");
        if (raw) {
          const parsed = JSON.parse(raw);
          setIsAdmin(parsed.userRoleId === 1);
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

  /* Derived options */
  const supplierOptions = useMemo(() => {
    // Only show suppliers that carry at least one active item (supplier product).
    const eligible = suppliers.filter((s) =>
      supplierIdsWithItems.has(s.companyId),
    );
    const options = eligible.map((s) => ({
      value: s.companyId,
      label: s.companyName,
    }));
    // When editing, keep the currently-selected supplier visible even if they
    // no longer have catalog items, so the form does not lose its value.
    if (!selectedSupplier || options.some((o) => o.value === selectedSupplier)) {
      return options;
    }
    const selected = suppliers.find((s) => s.companyId === selectedSupplier);
    return selected
      ? [{ value: selected.companyId, label: selected.companyName }, ...options]
      : options;
  }, [suppliers, supplierIdsWithItems, selectedSupplier]);

  const productOptions = useMemo(
    () => supplierProducts.map((offering) => ({
      value: offering.supplierProductId,
      label: offering.supplierProductCode
        ? `${offering.supplierProductCode} - ${offering.supplierProductName}`
        : offering.supplierProductName,
    })),
    [supplierProducts],
  );

  useEffect(() => {
    const request = selectedSupplier
      ? supplierProductV2Service.getAll({ supplierId: selectedSupplier, status: "active" })
      : Promise.resolve([] as SupplierProductV2[]);
    request
      .then(setSupplierProducts).catch(() => setSupplierProducts([]));
  }, [selectedSupplier]);

  const unitOptions = useMemo(() => {
    const map = new Map<string, string>();
    productUnits.forEach((u) => {
      if (u.code) map.set(u.code, u.name || u.code);
    });
    products.forEach((p) => {
      const code = p.unit?.code || p.unit?.name;
      if (code) map.set(code, p.unit?.name || code);
    });
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [productUnits, products]);

  const unitOptionsFor = useCallback(
    (unitValue: string) => {
      if (!unitValue) return unitOptions;
      if (unitOptions.some((o) => o.value === unitValue)) return unitOptions;
      return [{ value: unitValue, label: unitValue }, ...unitOptions];
    },
    [unitOptions],
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

  /* Calculate total amount for a line item */
  const calculateTotal = (quantity: number, pricePerUnit: number): number => {
    return quantity * pricePerUnit;
  };

  /* Calculate order total */
  const orderTotal = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + item.totalAmount, 0);
  }, [lineItems]);

  const editOrderTotal = useMemo(() => {
    return editLineItems.reduce((sum, item) => sum + item.totalAmount, 0);
  }, [editLineItems]);

  /* Table columns */
  const columns: ColumnDef<PurchaseOrderSummary>[] = useMemo(
    () => [
      {
        accessorKey: "poNumber",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            PO No.
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ getValue }) => {
          const val = String(getValue() ?? "");
          if (val.startsWith("DRAFT-"))
            return <span className="text-muted-foreground italic">Draft</span>;
          return <span className="font-semibold">{val}</span>;
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
        accessorKey: "supplierName",
        header: "Supplier",
      },
      {
        id: "itemCount",
        header: "Items",
        cell: ({ row }) => `${row.original.items?.length ?? 0} item(s)`,
      },
      {
        accessorKey: "totalAmount",
        header: "Total Amount",
        cell: ({ getValue }) => {
          const amount = Number(getValue()) || 0;
          return <span className="font-semibold">₱{amount.toFixed(2)}</span>;
        },
      },
      {
        accessorKey: "preparedBy",
        header: "Prepared By",
        cell: ({ getValue }) => {
          const v = String(getValue() ?? "").trim();
          return v ? (
            <span>{v}</span>
          ) : (
            <span className="text-muted-foreground italic">—</span>
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
            approved: { label: "Approved", variant: "default" },
            completed: { label: "Completed", variant: "default" },
            deleted: { label: "Deleted", variant: "destructive" },
            cancelled: { label: "Cancelled", variant: "destructive" },
          };
          const cfg = map[s] || map.created;
          return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
        },
      },
      {
        id: "lastUpdated",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Last Updated
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const updatedAt = row.original.updatedDate;
          const createdAt = row.original.createdAt;
          const timestamp = updatedAt || createdAt;

          if (!timestamp) {
            return <span className="text-muted-foreground italic">—</span>;
          }

          try {
            const date = new Date(timestamp);
            const dateStr = date.toLocaleDateString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const timeStr = date.toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
            return (
              <div className="flex flex-col text-xs">
                <span className="text-foreground">{dateStr}</span>
                <span className="text-[11px] text-muted-foreground">
                  {timeStr}
                </span>
              </div>
            );
          } catch {
            return <span className="text-muted-foreground italic">—</span>;
          }
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const locked = ["completed", "deleted", "cancelled"].includes(
            row.original.status,
          );
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  setPreviewingPo(row.original.poNumber);
                  try {
                    const preview = await purchaseOrderService.getPreview(
                      row.original.poNumber,
                    );
                    setViewPo(preview);
                  } catch {
                    toast.error("Failed to load PO preview.");
                  } finally {
                    setPreviewingPo(null);
                  }
                }}
                disabled={previewingPo !== null}
                title="Preview"
              >
                {previewingPo === row.original.poNumber ? (
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setViewItemsTarget(row.original)}
                disabled={!row.original.items?.length}
                title="View Items"
              >
                <FileText className="h-4 w-4" />
              </Button>
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
    [previewingPo],
  );

  /* Create modal handlers */
  const openCreateModal = () => {
    setSelectedSupplier("");
    setOrderDate(new Date().toISOString().split("T")[0]);
    setPoNumber("");
    setPoNumberMode("automatic");
    setPrNumber("");
    setApprovedBy("");
    setNotedBy("");
    setComments("");
    setDeliveryDate("");
    setPaymentTerms("");
    setLineItems([]);
    setManualRows(new Set());
    setModalOpen(true);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { ...EMPTY_LINE_ITEM, itemNo: lineItems.length + 1 },
    ]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    if (field === "supplierProductId") {
      const offering = supplierProducts.find((p) => p.supplierProductId === value);
      const prod = products.find((p) => p.id === offering?.productId);
      updated[index] = {
        ...updated[index],
        supplierProductId: String(value),
        productId: offering?.productId || "",
        productCode: prod?.code || "",
        unit: prod?.unit?.code || "PC",
        description: offering?.supplierProductName || prod?.name || "",
        pricePerUnit: offering?.costPerUnit || 0,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    // Recalculate total
    updated[index].totalAmount = calculateTotal(
      updated[index].quantity,
      updated[index].pricePerUnit,
    );
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
    setManualRows((prev) => {
      const next = new Set(prev);
      next.delete(index);
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
    if (!selectedSupplier) {
      toast.error("Please select a supplier.");
      return;
    }
    if (poNumberMode === "manual") {
      const match = poNumber.trim().toUpperCase().match(/^AIC-PO-(\d{4})-(\d{4})$/);
      if (!match || Number(match[2]) < 1 || match[1] !== orderDate.slice(0, 4)) {
        toast.error("Manual PO number must be AIC-PO-YYYY-NNNN and match the PO date year.");
        return;
      }
    }
    if (
      lineItems.length === 0 ||
      !lineItems.some((li) => li.productCode || li.description.trim())
    ) {
      toast.error("Please add at least one valid item.");
      return;
    }

    setPrinting(true);
    try {
      const payload = {
        supplierId: selectedSupplier,
        date: orderDate,
        poNumberMode,
        poNumber: poNumberMode === "manual" ? poNumber : undefined,
        prNumber,
        preparedBy,
        approvedBy,
        notedBy,
        comments,
        deliveryDate,
        paymentTerms,
        items: lineItems.map((item) => ({
          itemNo: item.itemNo,
          productCode: item.productCode,
          productId: item.productId,
          supplierProductId: item.supplierProductId,
          unit: item.unit,
          description: item.description,
          quantity: item.quantity,
          pricePerUnit: item.pricePerUnit,
          totalAmount: calculateTotal(item.quantity, item.pricePerUnit),
        })),
        status: "printed",
      };

      const res = await purchaseOrderService.create(payload);

      let driveFileLink: string | undefined;
      try {
        // Generate the letter PDF from the HTML layout and persist it to Google Drive.
        const pdfBase64 = await generatePurchaseOrderPdfBase64(res);
        const saved = await purchaseOrderService.savePdfToDrive({
          poNumber: res.poNumber,
          supplierName: res.supplierName,
          date: res.date,
          pdfBase64,
        });
        driveFileLink = saved.fileLink;
      } catch (e) {
        console.warn("Auto-save PO PDF to Drive failed (non-fatal):", e);
      }

      toast.success(`Purchase Order #${res.poNumber} created!`);
      setPoResult({ ...res, driveFileLink });
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to process purchase order.");
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier.");
      return;
    }
    setDrafting(true);
    try {
      const payload = {
        supplierId: selectedSupplier,
        date: orderDate,
        poNumberMode: "automatic" as const,
        prNumber,
        preparedBy: preparedBy || "",
        approvedBy: approvedBy || "",
        notedBy: notedBy || "",
        comments,
        deliveryDate,
        paymentTerms,
        items: lineItems.map((item) => ({
          itemNo: item.itemNo,
          productCode: item.productCode,
          productId: item.productId,
          supplierProductId: item.supplierProductId,
          unit: item.unit,
          description: item.description,
          quantity: item.quantity,
          pricePerUnit: item.pricePerUnit,
          totalAmount: calculateTotal(item.quantity, item.pricePerUnit),
        })),
        status: "draft",
      };
      await purchaseOrderService.create(payload);
      toast.success("Purchase order saved as draft.");
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to save draft.");
    } finally {
      setDrafting(false);
    }
  };

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await purchaseOrderService.delete(deleteTarget.poNumber);
      toast.success(
        deleteTarget.poNumber.startsWith("DRAFT-")
          ? `Draft PO deleted.`
          : `PO #${deleteTarget.poNumber} deleted.`,
      );
      setDeleteTarget(null);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete purchase order.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (editTarget) {
      setSelectedSupplier(editTarget.supplierId);
      setEditDate(editTarget.date);
      setEditPrNumber(editTarget.prNumber || "");
      setEditComments(editTarget.comments || "");
      setEditDeliveryDate(editTarget.deliveryDate || "");
      setEditPaymentTerms(editTarget.paymentTerms || "");
      setEditApprovedBy(editTarget.approvedBy || "");
      setEditNotedBy(editTarget.notedBy || "");
      setEditStatus(editTarget.status || "created");
      setEditPONumberMode("automatic");
      setEditPONumber("");
      setEditLineItems(
        editTarget.items.map((item) => ({
          itemNo: item.itemNo || 0,
          productCode: item.productCode || "",
          productId: item.productId || "",
          supplierProductId: item.supplierProductId || "",
          unit: item.unit || "",
          description: item.description || "",
          quantity: item.quantity || 0,
          pricePerUnit: item.pricePerUnit || 0,
          totalAmount: item.totalAmount || 0,
        })),
      );
      const manual = new Set<number>();
      editTarget.items.forEach((item, i) => {
        if (!item.productCode && item.description?.trim()) manual.add(i);
      });
      setEditManualRows(manual);
    }
  }, [editTarget]);

  const addEditLineItem = () =>
    setEditLineItems((prev) => [
      ...prev,
      { ...EMPTY_LINE_ITEM, itemNo: prev.length + 1 },
    ]);
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
      prev.map((item, i) => {
        if (i === idx) {
          const offering = field === "supplierProductId"
            ? supplierProducts.find((p) => p.supplierProductId === value)
            : undefined;
          const product = products.find((p) => p.id === offering?.productId);
          const updated = field === "supplierProductId"
            ? { ...item, supplierProductId: String(value), productId: offering?.productId || "", productCode: product?.code || "", description: offering?.supplierProductName || product?.name || "", unit: product?.unit?.code || "PC", pricePerUnit: offering?.costPerUnit || 0 }
            : { ...item, [field]: value };
          if (field === "quantity" || field === "pricePerUnit") {
            updated.totalAmount = calculateTotal(
              updated.quantity,
              updated.pricePerUnit,
            );
          }
          return updated;
        }
        return item;
      }),
    );

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (editTarget.poNumber.startsWith("DRAFT-") && editStatus !== "draft" && editPONumberMode === "manual") {
      const match = editPONumber.trim().toUpperCase().match(/^AIC-PO-(\d{4})-(\d{4})$/);
      if (!match || Number(match[2]) < 1 || match[1] !== editDate.slice(0, 4)) {
        toast.error("Manual PO number must be AIC-PO-YYYY-NNNN and match the PO date year.");
        return;
      }
    }
    setEditSubmitting(true);
    try {
      const payload = {
        date: editDate,
        prNumber: editPrNumber,
        comments: editComments,
        deliveryDate: editDeliveryDate,
        paymentTerms: editPaymentTerms,
        approvedBy: editApprovedBy,
        notedBy: editNotedBy,
        status: editStatus,
        poNumberMode: editPONumberMode,
        poNumber: editPONumberMode === "manual" ? editPONumber : undefined,
        items: editLineItems
          .filter((li) => li.productCode || li.description.trim())
          .map((li) => ({
            itemNo: li.itemNo,
            productCode: li.productCode,
            productId: li.productId,
            supplierProductId: li.supplierProductId,
            unit: li.unit,
            description: li.description,
            quantity: li.quantity,
            pricePerUnit: li.pricePerUnit,
            totalAmount: calculateTotal(li.quantity, li.pricePerUnit),
          })),
      };
      const res = await purchaseOrderService.update(
        editTarget.poNumber,
        payload,
      );
      toast.success(
        res.poNumber.startsWith("DRAFT-")
          ? `Draft PO updated.`
          : `PO #${res.poNumber} updated.`,
      );

      if (editStatus !== "draft") {
        try {
          // Regenerate the letter PDF from the HTML layout and update the Drive copy.
          const pdfBase64 = await generatePurchaseOrderPdfBase64(res);
          await purchaseOrderService.savePdfToDrive({
            poNumber: res.poNumber,
            supplierName: editTarget.supplierName,
            date: editDate,
            pdfBase64,
          });
        } catch (e) {
          console.warn("Auto-save PO PDF to Drive failed (non-fatal):", e);
        }
      }

      setEditTarget(null);
      fetchList();
    } catch (err: any) {
      toast.error(err.message || "Failed to update purchase order.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-6 space-y-6">
        <EntityTable
          title="Purchase Orders"
          columns={columns}
          data={orders}
          loading={loading}
          onCreateNew={openCreateModal}
        />
      </div>

      {/* Create PO Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="space-y-1.5 md:col-span-6">
                <Label>
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={selectedSupplier}
                  onValueChange={setSelectedSupplier}
                  options={supplierOptions}
                  placeholder="Select Supplier"
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>PO Number</Label>
                <div className="flex gap-2">
                  <Input
                    value={poNumber}
                    disabled={poNumberMode === "automatic" || printing || drafting}
                    onChange={(e) => setPoNumber(e.target.value.toUpperCase())}
                    placeholder={poNumberMode === "automatic" ? "Automatically generated when finalized" : "AIC-PO-YYYY-NNNN"}
                  />
                  {isAdmin && <Button type="button" variant="outline" onClick={() => { if (poNumberMode === "manual") { setPoNumberMode("automatic"); setPoNumber(""); } else setPoNumberMode("manual"); }} disabled={printing || drafting}>
                    {poNumberMode === "manual" ? "Use automatic number" : "Enter manually"}
                  </Button>}
                </div>
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>PR# (Purchase Request)</Label>
                <Input
                  value={prNumber}
                  onChange={(e) => setPrNumber(e.target.value)}
                  placeholder="e.g. PR-2024-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Delivery Date</Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}><SelectTrigger><SelectValue placeholder="Select payment terms" /></SelectTrigger><SelectContent>{paymentTermOptions.map((term) => <SelectItem key={term.paymentTermId} value={term.name}>{term.name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>

            {/* Products Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">
                  Products / Items
                </Label>
                <Button size="sm" variant="outline" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {lineItems.length > 0 && (
                <div className="flex gap-2 items-center text-xs font-semibold text-muted-foreground px-1">
                  <div className="w-10 shrink-0">#</div>
                  <div className="flex-1 min-w-[200px]">Item / Description</div>
                  <div className="w-10 shrink-0" />
                  <div className="w-28 shrink-0">Unit</div>
                  <div className="w-20 shrink-0">Qty</div>
                  <div className="w-28 shrink-0">Unit Price</div>
                  <div className="w-28 shrink-0">Total</div>
                  <div className="w-10 shrink-0" />
                </div>
              )}

              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <div className="w-10 shrink-0 text-center text-sm text-muted-foreground">
                    {item.itemNo}
                  </div>
                  {manualRows.has(idx) ? (
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
                        className="w-10 shrink-0"
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
                    <>
                      <div className="flex-1 min-w-[200px]">
                        <SearchableSelect
                          value={item.supplierProductId}
                          onValueChange={(v) =>
                            updateLineItem(idx, "supplierProductId", v)
                          }
                          options={productOptions}
                          placeholder="Select supplier product"
                          onAddOption={(searchText) =>
                            handleOpenQuickAddProduct(searchText, "create", idx)
                          }
                          addOptionLabel="+ Add Product"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-10 shrink-0"
                        title="Type manually"
                        onClick={() => {
                          setManualRows((prev) => new Set(prev).add(idx));
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <div className="w-28 shrink-0">
                    <SearchableSelect
                      value={item.unit}
                      onValueChange={(v) => updateLineItem(idx, "unit", v)}
                      options={unitOptionsFor(item.unit)}
                      placeholder="Unit"
                      searchPlaceholder="Search units..."
                    />
                  </div>
                  <Input
                    className="w-20 shrink-0"
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
                  <Input
                    className="w-28 shrink-0"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.pricePerUnit}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "pricePerUnit",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <div className="w-28 shrink-0 text-right font-medium tabular-nums">
                    ₱{item.totalAmount.toFixed(2)}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-10 text-destructive shrink-0"
                    onClick={() => removeLineItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {lineItems.length > 0 && (
                <div className="flex justify-end border-t pt-2 mt-2">
                  <div className="text-sm font-semibold">
                    Total:{" "}
                    <span className="text-lg">₱{orderTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>
                  Prepared By <span className="text-destructive">*</span>
                </Label>
                <Input value={preparedBy} readOnly placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>Approved By</Label>
                <Input
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="e.g. Department Manager"
                />
              </div>
              <div className="space-y-2">
                <Label>Noted By</Label>
                <Input
                  value={notedBy}
                  onChange={(e) => setNotedBy(e.target.value)}
                  placeholder="e.g. General Manager"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Comments / Special Instructions</Label>
              <Textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="e.g. Please deliver to warehouse A"
              />
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
              {drafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Draft
            </Button>
            <Button
              onClick={handleSaveAndPrint}
              disabled={drafting || printing}
            >
              {printing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Save &amp; Print Purchase Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PurchaseOrderPreviewModal
        po={poResult}
        open={!!poResult}
        onOpenChange={(v) => {
          if (!v) setPoResult(null);
        }}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete Purchase Order"
        description={`Are you sure you want to delete PO ${deleteTarget && !deleteTarget.poNumber.startsWith("DRAFT-") ? `#${deleteTarget.poNumber}` : "Draft"}? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Edit PO Dialog */}
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
              {editTarget && !editTarget.poNumber.startsWith("DRAFT-")
                ? `Edit PO #${editTarget.poNumber}`
                : `Edit Draft PO`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PO Number</Label>
                {editTarget && !editTarget.poNumber.startsWith("DRAFT-") ? (
                  <Input value={editTarget.poNumber} readOnly className="bg-muted" />
                ) : (
                  <div className="flex gap-2"><Input value={editPONumber} disabled={editPONumberMode === "automatic" || editSubmitting} onChange={(e) => setEditPONumber(e.target.value.toUpperCase())} placeholder={editPONumberMode === "automatic" ? "Automatically generated when finalized" : "AIC-PO-YYYY-NNNN"} />
                    {isAdmin && <Button type="button" variant="outline" disabled={editSubmitting} onClick={() => { if (editPONumberMode === "manual") { setEditPONumberMode("automatic"); setEditPONumber(""); } else setEditPONumberMode("manual"); }}>{editPONumberMode === "manual" ? "Use automatic number" : "Enter manually"}</Button>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={editTarget?.supplierName ?? ""}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>PR#</Label>
                <Input
                  value={editPrNumber}
                  onChange={(e) => setEditPrNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Delivery Date</Label>
                <Input
                  type="date"
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select value={editPaymentTerms} onValueChange={setEditPaymentTerms}><SelectTrigger><SelectValue placeholder="Select payment terms" /></SelectTrigger><SelectContent>{[...new Set([editPaymentTerms, ...paymentTermOptions.map((term) => term.name)])].filter(Boolean).map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>

            {/* Products Section - Edit PO */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">
                  Products / Items
                </Label>
                <Button size="sm" variant="outline" onClick={addEditLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {editLineItems.length > 0 && (
                <div className="flex gap-2 items-center text-xs font-semibold text-muted-foreground px-1">
                  <div className="w-10 shrink-0">#</div>
                  <div className="flex-1 min-w-[200px]">Item / Description</div>
                  <div className="w-10 shrink-0" />
                  <div className="w-28 shrink-0">Unit</div>
                  <div className="w-20 shrink-0">Qty</div>
                  <div className="w-28 shrink-0">Unit Price</div>
                  <div className="w-28 shrink-0">Total</div>
                  <div className="w-10 shrink-0" />
                </div>
              )}

              {editLineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <div className="w-10 shrink-0 text-center text-sm text-muted-foreground">
                    {item.itemNo}
                  </div>
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
                        className="w-10 shrink-0"
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
                          value={item.supplierProductId}
                          onValueChange={(v) =>
                            updateEditLineItem(idx, "supplierProductId", v)
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
                        className="w-10 shrink-0"
                        title="Type manually"
                        onClick={() =>
                          setEditManualRows((prev) => new Set(prev).add(idx))
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <div className="w-28 shrink-0">
                    <SearchableSelect
                      value={item.unit}
                      onValueChange={(v) => updateEditLineItem(idx, "unit", v)}
                      options={unitOptionsFor(item.unit)}
                      placeholder="Unit"
                      searchPlaceholder="Search units..."
                    />
                  </div>
                  <Input
                    className="w-20 shrink-0"
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateEditLineItem(
                        idx,
                        "quantity",
                        parseInt(e.target.value) || 1,
                      )
                    }
                  />
                  <Input
                    className="w-28 shrink-0"
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.pricePerUnit}
                    onChange={(e) =>
                      updateEditLineItem(
                        idx,
                        "pricePerUnit",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <div className="w-28 shrink-0 text-right font-medium tabular-nums">
                    ₱{item.totalAmount.toFixed(2)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-10 text-destructive shrink-0"
                    onClick={() => removeEditLineItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {editLineItems.length > 0 && (
                <div className="flex justify-end border-t pt-2 mt-2">
                  <div className="text-sm font-semibold">
                    Total:{" "}
                    <span className="text-lg">
                      ₱{editOrderTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Prepared By</Label>
                <Input
                  value={editTarget?.preparedBy ?? ""}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Approved By</Label>
                <Input
                  value={editApprovedBy}
                  onChange={(e) => setEditApprovedBy(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Noted By</Label>
                <Input
                  value={editNotedBy}
                  onChange={(e) => setEditNotedBy(e.target.value)}
                />
              </div>
            </div>

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
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

      <PurchaseOrderPreviewModal
        po={viewPo}
        open={!!viewPo}
        onOpenChange={(v) => {
          if (!v) setViewPo(null);
        }}
      />

      <Dialog
        open={!!viewItemsTarget}
        onOpenChange={(v) => {
          if (!v) setViewItemsTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              PO Items —{" "}
              {viewItemsTarget && !viewItemsTarget.poNumber.startsWith("DRAFT-")
                ? `#${viewItemsTarget.poNumber}`
                : "Draft PO"}
            </DialogTitle>
          </DialogHeader>
          {viewItemsTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Supplier
                  </Label>
                  <div className="font-medium">
                    {viewItemsTarget.supplierName || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <div className="font-medium">
                    {viewItemsTarget.date || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Status
                  </Label>
                  <div className="font-medium capitalize">
                    {viewItemsTarget.status || "—"}
                  </div>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium w-10 text-right">
                        #
                      </th>
                      <th className="px-3 py-2 font-medium w-16 text-right">
                        Qty
                      </th>
                      <th className="px-3 py-2 font-medium w-20 text-center">
                        Unit
                      </th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium text-right">
                        Unit Price
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItemsTarget.items &&
                    viewItemsTarget.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-4 text-center text-muted-foreground"
                        >
                          No items on this purchase order.
                        </td>
                      </tr>
                    ) : (
                      (viewItemsTarget.items || []).map((item, i) => {
                        const descriptionText =
                          item.description?.trim() ||
                          productNameByCode[item.productCode || ""] ||
                          item.productCode ||
                          "—";

                        return (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2 text-right tabular-nums">
                              {item.itemNo || i + 1}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {item.unit || "—"}
                            </td>
                            <td className="px-3 py-2">{descriptionText}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              ₱{(item.pricePerUnit || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              ₱{(item.totalAmount || 0).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {viewItemsTarget.items &&
                    viewItemsTarget.items.length > 0 && (
                      <tfoot className="border-t bg-muted/20">
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-2 text-right font-semibold"
                          >
                            Total:
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            ₱{(viewItemsTarget.totalAmount || 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                </table>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setViewItemsTarget(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

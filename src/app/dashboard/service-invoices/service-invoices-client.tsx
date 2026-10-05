"use client";
import { DatePickerInput, MonthPickerInput } from "@/components/ui/date-picker";
import { InvoiceDiscountEditor } from "@/components/invoice-discount-editor";
import { defaultDiscount } from "@/lib/discounts";
import { invoiceTotals } from "@/lib/serviceInvoiceDiscounts";

import { InvoiceReferenceTypeSelector } from "@/components/delivery-release-reference-field";
import type { DeliveryReferenceMode } from "@/lib/deliveryReference";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FilterMultiSelect } from "@/components/ui/filter-multi-select";
import { InvoiceCategoryPicker } from "@/components/invoice-category-picker";
import ServiceInvoiceReporting from "@/components/service-invoice-reporting";
import {
  buildServiceInvoiceSummaryReport,
  reportRange,
} from "@/lib/serviceInvoiceSummary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PAYMENT_LABELS } from "@/lib/serviceInvoiceTracking";
import {
  MANUAL_INVOICE_CATEGORIES,
  matchesInvoiceFilters,
} from "@/lib/serviceInvoiceFilters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EntityTable, ArrowUpDown } from "@/components/ui/entity-table";
import { DocumentRegisterHeader } from "@/components/document-register-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  SlidersHorizontal,
  ChevronDown,
  Trash2,
  Loader2,
  Eye,
  Pencil,
  ExternalLink,
  Upload,
  FileText,
  CheckCircle2,
  RotateCcw,
  Recycle,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import companyService from "@/lib/services/company.service";
import contractService from "@/lib/services/contract.service";
import deliveryService from "@/lib/services/delivery.service";
import userService from "@/lib/services/user.service";
import serviceInvoiceService from "@/lib/services/service-invoice.service";
import serviceReportService from "@/lib/services/service-report.service";
import salesOrderService, {
  type OrderRowView,
} from "@/lib/services/sales-order.service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REPORT_TYPE_LABELS } from "@/lib/serviceReports/labels";
import type { ServiceReportType } from "@/types/serviceReport";
import { ServiceInvoicePreviewModal } from "@/components/service-invoice-preview-modal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Badge } from "@/components/ui/badge";
import {
  ServiceInvoiceResponse,
  ServiceInvoiceSummary,
} from "@/types/serviceInvoice";

interface LineItem {
  salesOrderItemId?: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

const EMPTY_LINE_ITEM: LineItem = {
  description: "",
  quantity: 1,
  unitPrice: 0,
};

export default function ServiceInvoicesClient({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewDrRaw = searchParams.get("viewDR");
  const activeTab =
    isAdmin && searchParams.get("tab") === "summary" ? "summary" : "invoices";
  const changeTab = (tab: string) => {
    const query = new URLSearchParams(searchParams.toString());
    if (tab === "summary") query.set("tab", tab);
    else query.delete("tab");
    router.replace(
      `/dashboard/service-invoices${query.size ? `?${query}` : ""}`,
      { scroll: false },
    );
  };

  /* List state */
  const [invoices, setInvoices] = useState<ServiceInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  /** Service Report type per report id (best effort; never blocks the list). */
  const [reportTypeByReportId, setReportTypeByReportId] = useState<
    Record<string, ServiceReportType>
  >({});

  const reportTypeLabelFor = useCallback(
    (reportId?: string): string => {
      if (!reportId) return "";
      const type = reportTypeByReportId[reportId];
      return type ? ` (${REPORT_TYPE_LABELS[type]})` : "";
    },
    [reportTypeByReportId],
  );

  useEffect(() => {
    void serviceReportService
      .list()
      .then((result) => {
        const map: Record<string, ServiceReportType> = {};
        for (const row of result.rows ?? [])
          map[row.report.serviceReportId] = row.report.reportType;
        setReportTypeByReportId(map);
      })
      .catch(() => {});
  }, []);

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
  const [discountSettings, setDiscountSettings] = useState(defaultDiscount());
  const [editDiscountSettings, setEditDiscountSettings] =
    useState(defaultDiscount());
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [referenceMode, setReferenceMode] =
    useState<DeliveryReferenceMode | null>(null);
  const [editReferenceMode, setEditReferenceMode] =
    useState<DeliveryReferenceMode>("SALES_ORDER");

  /* Linked DR */
  const [linkedDrNumber, setLinkedDrNumber] = useState("");
  const [linkedSalesOrderId, setLinkedSalesOrderId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [drOptions, setDrOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [salesOrderOptions, setSalesOrderOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [salesOrdersById, setSalesOrdersById] = useState<
    Record<string, OrderRowView["order"]>
  >({});
  /* Assigned technician (ServiceInvoices M/N). Inherited from a linked DR. */
  const [technicianId, setTechnicianId] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [poNo, setPoNo] = useState("");
  const [trNo, setTrNo] = useState("");
  const [deliveryUsers, setDeliveryUsers] = useState<
    { value: string; label: string }[]
  >([]);
  const [deliveryUsersLoading, setDeliveryUsersLoading] = useState(true);
  const [deliveryUsersError, setDeliveryUsersError] = useState("");

  /* Invoice details modal */
  const [viewSi, setViewSi] = useState<ServiceInvoiceResponse | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  /* Edit modal state */
  const [editTarget, setEditTarget] = useState<ServiceInvoiceSummary | null>(
    null,
  );
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("created");
  const [editManualCategories, setEditManualCategories] = useState<string[]>(
    [],
  );
  const [categoryTarget, setCategoryTarget] =
    useState<ServiceInvoiceSummary | null>(null);
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [editInvoiceNo, setEditInvoiceNo] = useState("");
  const [paymentTarget, setPaymentTarget] =
    useState<ServiceInvoiceSummary | null>(null);
  const [paymentValue, setPaymentValue] = useState("unpaid");
  const [savingPayment, setSavingPayment] = useState(false);
  const [cancelTarget, setCancelTarget] =
    useState<ServiceInvoiceSummary | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [correctingInvoiceNo, setCorrectingInvoiceNo] = useState<string | null>(
    null,
  );
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editDrNumber, setEditDrNumber] = useState("");
  const [editSalesOrderId, setEditSalesOrderId] = useState("");
  const [editTechnicianId, setEditTechnicianId] = useState("");
  const [editTechnicianName, setEditTechnicianName] = useState("");
  const [editPoNo, setEditPoNo] = useState("");
  const [editTrNo, setEditTrNo] = useState("");
  const [completionTarget, setCompletionTarget] =
    useState<ServiceInvoiceSummary | null>(null);
  const [completionDate, setCompletionDate] = useState("");
  const [completionTechnicianId, setCompletionTechnicianId] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completingService, setCompletingService] = useState(false);
  const [reversalTarget, setReversalTarget] =
    useState<ServiceInvoiceSummary | null>(null);
  const [reversalDate, setReversalDate] = useState("");
  const [reversalNotes, setReversalNotes] = useState("");

  /* Delete */
  const [deleteTarget, setDeleteTarget] =
    useState<ServiceInvoiceSummary | null>(null);

  /* Scanned Service Invoice upload */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

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

  /* Upload a scanned Service Invoice for a specific invoice number */
  const handleUploadClick = (invoiceNo: string) => {
    setUploadTarget(invoiceNo);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadTarget) return;
    setUploading(true);
    try {
      const result = await serviceInvoiceService.uploadScanned(
        uploadTarget,
        file,
      );
      toast.success(`Scanned Service Invoice uploaded for ${uploadTarget}.`);
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.invoiceNo === uploadTarget
            ? {
                ...inv,
                driveFileLink: result.fileLink,
                scannedFileLink: result.fileLink,
                scannedStatus: "scanned",
                scanVerificationPending: false,
              }
            : inv,
        ),
      );
      fetchList();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to upload scanned invoice.",
      );
    } finally {
      setUploading(false);
      setUploadTarget(null);
    }
  };

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    deliveryService
      .getAll()
      .then((allDrs) =>
        setDrOptions(
          allDrs.map((d) => ({
            value: String(d.drNumber),
            label: `DR #${d.drNumber} — ${d.companyName} (${d.date})`,
          })),
        ),
      )
      .catch(() => setDrOptions([]));
  }, []);

  /* Read DR prefill from sessionStorage (set by DR preview modal "Create SI" button) */
  useEffect(() => {
    (async () => {
      try {
        const raw = sessionStorage.getItem("siPrefill");
        if (!raw) return;
        const prefill = JSON.parse(raw);
        if (!prefill.drNumber) return;

        // Load companies directly so they're guaranteed available for matching
        const allCos = await companyService.getAll();
        const customers = allCos.filter(
          (c: any) => c.companyType === "Customer" || c.companyType === "Both",
        );

        // Load DR options synchronously so the Linked DR dropdown is populated
        const allDrs = await deliveryService.getAll();
        setDrOptions(
          allDrs.map((d) => ({
            value: String(d.drNumber),
            label: `DR #${d.drNumber} — ${d.companyName} (${d.date})`,
          })),
        );

        setLinkedDrNumber(String(prefill.drNumber));
        if (prefill.companyName && customers.length > 0) {
          const match = customers.find(
            (c: any) => c.companyName === prefill.companyName,
          );
          if (match) setSelectedCustomer(match.companyId);
        }

        // Only clear sessionStorage after the match attempt succeeds
        sessionStorage.removeItem("siPrefill");
        setModalOpen(true);
      } catch {
        /* ignore malformed */
      }
    })();
  }, []);

  /* Eligible application users for manual Service Invoice handover. */
  useEffect(() => {
    userService
      .getAllUsers()
      .then((users) =>
        setDeliveryUsers(
          users
            .filter((user) => user.userId && user.fullName.trim())
            .map((user) => ({ value: user.userId, label: user.fullName })),
        ),
      )
      .catch((error) =>
        setDeliveryUsersError(
          error instanceof Error
            ? error.message
            : "Failed to load eligible users.",
        ),
      )
      .finally(() => setDeliveryUsersLoading(false));
  }, []);

  /* Load customers + current user for PreparedBy */
  useEffect(() => {
    companyService
      .getAll()
      .then((all) =>
        setCompanies(
          all.filter(
            (c) => c.companyType === "Customer" || c.companyType === "Both",
          ),
        ),
      )
      .catch(() => toast.error("Failed to load customers."));
    (async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          setPreparedBy(String(data.result?.fullName || "").trim());
        }
      } catch {
        // Keep the field empty until the user's full name can be resolved.
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

  /* Auto-select customer when user picks a Linked DR */
  useEffect(() => {
    if (!linkedDrNumber || companies.length === 0) return;
    const drNum = parseInt(linkedDrNumber, 10);
    if (isNaN(drNum)) return;
    // Look up the selected DR from the current DR list to get its company
    deliveryService
      .getAll()
      .then((allDrs) => {
        const matchedDr = allDrs.find((d) => d.drNumber === drNum);
        if (matchedDr) {
          const customer = companies.find(
            (c: any) => c.companyId === matchedDr.companyId,
          );
          if (customer) setSelectedCustomer(customer.companyId);
        }
      })
      .catch(() => {
        /* non-critical */
      });
  }, [linkedDrNumber, companies]);

  /* Linked DR owns the assigned technician; show its current user immediately.
     The server re-resolves the technician from the DR on save. */
  useEffect(() => {
    if (!linkedDrNumber) return;
    const selected = deliveryService
      .getAll()
      .then((drs) =>
        drs.find((dr) => dr.drNumber === parseInt(linkedDrNumber, 10)),
      );
    selected
      .then((dr) => {
        if (dr) {
          setReferenceMode(dr.salesOrderId ? "SALES_ORDER" : "TR_NUMBER");
          setLinkedSalesOrderId(dr.salesOrderId || "");
        }
        setTechnicianId(dr?.deliveredById || "");
        setTechnicianName(dr?.deliveredBy || "");
        setPoNo(dr?.poNo || "");
        setTrNo(dr?.trNo || "");
      })
      .catch(() => {
        setTechnicianId("");
        setTechnicianName("");
      });
  }, [linkedDrNumber]);

  useEffect(() => {
    if (!modalOpen && !editTarget) return;
    salesOrderService
      .list({ pageSize: 1000, view: "services" })
      .then((result) => {
        const orders = result.rows
          .filter(
            (row) =>
              row.order.orderStatus === "CONFIRMED" ||
              row.order.orderStatus === "ON_HOLD",
          )
          .map((row) => row.order);
        setSalesOrderOptions(
          orders.map((order) => ({
            value: order.salesOrderId,
            label: `${order.salesOrderNo} — ${order.customerNameSnapshot}`,
          })),
        );
        setSalesOrdersById(
          Object.fromEntries(
            orders.map((order) => [order.salesOrderId, order]),
          ),
        );
      })
      .catch(() => {
        setSalesOrderOptions([]);
        setSalesOrdersById({});
      });
  }, [modalOpen, editTarget]);

  useEffect(() => {
    if (!linkedSalesOrderId || linkedDrNumber) return;
    const order = salesOrdersById[linkedSalesOrderId];
    if (!order) return;
    setSelectedCustomer(order.customerId);
    if (referenceMode !== "SALES_ORDER") return;
    setPoNo(order.customerPONo || "");
    setTrNo(order.salesOrderNo || "");
  }, [linkedSalesOrderId, linkedDrNumber, salesOrdersById, referenceMode]);

  useEffect(() => {
    if (!editDrNumber) return;
    deliveryService
      .getAll()
      .then((drs) =>
        drs.find((dr) => dr.drNumber === parseInt(editDrNumber, 10)),
      )
      .then((dr) => {
        if (dr) {
          setEditReferenceMode(dr.salesOrderId ? "SALES_ORDER" : "TR_NUMBER");
          setEditSalesOrderId(dr.salesOrderId || "");
        }
        setEditTechnicianId(dr?.deliveredById || "");
        setEditTechnicianName(dr?.deliveredBy || "");
        setEditPoNo(dr?.poNo || "");
        setEditTrNo(dr?.trNo || "");
      })
      .catch(() => {
        setEditTechnicianId("");
        setEditTechnicianName("");
      });
  }, [editDrNumber]);

  useEffect(() => {
    if (
      !editSalesOrderId ||
      editDrNumber ||
      editReferenceMode !== "SALES_ORDER"
    )
      return;
    const order = salesOrdersById[editSalesOrderId];
    if (!order) return;
    setEditPoNo(order.customerPONo || "");
    setEditTrNo(order.salesOrderNo || "");
  }, [editSalesOrderId, editDrNumber, salesOrdersById, editReferenceMode]);

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
        cell: ({ getValue, row }) => {
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
        accessorKey: "paymentStatus",
        header: "Payment status",
        cell: ({ row }) => (
          <div className="space-y-1">
            <Badge
              variant={
                row.original.paymentStatus === "full" ? "default" : "outline"
              }
            >
              {PAYMENT_LABELS[row.original.paymentStatus ?? "unpaid"]}
            </Badge>
            {isAdmin && row.original.status === "created" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1 text-xs"
                onClick={() => {
                  setPaymentTarget(row.original);
                  setPaymentValue(row.original.paymentStatus ?? "unpaid");
                }}
              >
                Update payment
              </Button>
            )}
          </div>
        ),
      },
      {
        accessorKey: "scannedStatus",
        header: "Scanned copy",
        cell: ({ row }) => (
          <div>
            <Badge
              variant={
                row.original.scannedStatus === "scanned" ? "default" : "outline"
              }
            >
              {row.original.scannedStatus === "scanned"
                ? "Scanned"
                : "Not scanned"}
            </Badge>
            {row.original.scanVerificationPending && (
              <p className="text-xs text-muted-foreground">
                Existing attachment could not be verified; upload a scan to
                confirm.
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ getValue, row }) => {
          const invoice = row.original;
          const label = String(getValue() || "Uncategorized");
          const editable =
            invoice.categorySource !== "automatic" &&
            (label === "Uncategorized" ||
              invoice.categorySource === "manual") &&
            !["cancelled", "void", "deleted"].includes(invoice.status);
          return editable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto whitespace-normal px-1 text-left underline decoration-dotted"
              title="Update invoice category"
              onClick={(event) => {
                event.stopPropagation();
                setManualCategories(invoice.manualCategories ?? []);
                setCategoryTarget(invoice);
              }}
            >
              {label}
            </Button>
          ) : (
            label
          );
        },
      },
      {
        accessorKey: "preparedBy",
        header: "Prepared By",
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => {
          const total = invoiceTotals(row.original).grandTotal;
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
        header: "Invoice status",
        cell: ({ getValue, row }) => {
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
            void: { label: "Void", variant: "outline" },
            deleted: { label: "Deleted", variant: "destructive" },
            cancelled: { label: "Cancelled", variant: "destructive" },
          };
          const cfg = map[s] || map.created;
          const linkedNo =
            row.original.replacementInvoiceNo || row.original.replacesInvoiceNo;
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              {row.original.statusReason && (
                <span className="text-xs text-muted-foreground">
                  {row.original.statusReason}
                </span>
              )}
              {linkedNo && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    const linked = invoices.find(
                      (invoice) => invoice.invoiceNo === linkedNo,
                    );
                    if (linked?.status === "draft") setEditTarget(linked);
                    else if (linked)
                      void serviceInvoiceService
                        .getPreview(linkedNo)
                        .then(setViewSi)
                        .catch(() =>
                          toast.error("Failed to load linked invoice."),
                        );
                  }}
                >
                  {row.original.replacementInvoiceNo
                    ? `Replacement #${linkedNo}`
                    : `Replaces #${linkedNo}`}
                </Button>
              )}
            </div>
          );
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
          const updatedAt = row.original.updatedAt;
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
          const locked =
            row.original.status === "deleted" ||
            row.original.status === "void" ||
            row.original.status === "cancelled";
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
                    toast.error("Failed to load invoice details.");
                  } finally {
                    setPreviewing(null);
                  }
                }}
                disabled={previewing !== null}
                title="View invoice details"
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
                  title="View stored attachment"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => handleUploadClick(row.original.invoiceNo)}
                disabled={uploading}
                title="Upload scanned Service Invoice"
              >
                {uploading && uploadTarget === row.original.invoiceNo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
              {row.original.salesOrderId &&
                (row.original.manualCompletionStatus === "COMPLETED" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-amber-600 hover:text-amber-800"
                    onClick={() => {
                      setReversalTarget(row.original);
                      setReversalDate(new Date().toISOString().split("T")[0]);
                      setReversalNotes("");
                    }}
                    title="Reverse manual service completion"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-emerald-600 hover:text-emerald-800"
                    onClick={() => openManualCompletion(row.original)}
                    title="Mark service complete"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                ))}
              {row.original.serviceReportId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    router.push(
                      `/dashboard/service-reports/${row.original.serviceReportId}`,
                    )
                  }
                  title={`View Service Report${reportTypeLabelFor(row.original.serviceReportId)}`}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      disabled={!row.original.assignedTechnicianUserId}
                      title={
                        row.original.assignedTechnicianUserId
                          ? "Create Service Report"
                          : "Assign a technician before creating a Service Report."
                      }
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(
                          `/dashboard/service-reports/new?invoiceNo=${encodeURIComponent(row.original.invoiceNo)}&type=GENERAL`,
                        )
                      }
                    >
                      Create General Service Report
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(
                          `/dashboard/service-reports/new?invoiceNo=${encodeURIComponent(row.original.invoiceNo)}&type=WATER_TREATMENT`,
                        )
                      }
                    >
                      Create Water Treatment System Service Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!locked && (
                <>
                  {row.original.status === "created" &&
                    !row.original.replacementInvoiceNo && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="Cancel and create corrected copy"
                        aria-label="Cancel and create corrected copy"
                        disabled={
                          !!correctingInvoiceNo ||
                          row.original.paymentStatus !== "unpaid"
                        }
                        onClick={() => {
                          setCancelTarget(row.original);
                          setCancelReason("");
                        }}
                      >
                        {correctingInvoiceNo === row.original.invoiceNo ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Recycle className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    )}
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
                    disabled={row.original.paymentStatus !== "unpaid"}
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
    [
      previewing,
      uploading,
      uploadTarget,
      correctingInvoiceNo,
      invoices,
      isAdmin,
      reportTypeLabelFor,
      router,
    ],
  );
  /* When arriving with ?viewDR=<dr#>, only show the Service Invoices (SRs)
     linked to that Delivery Receipt. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterCustomers, setFilterCustomers] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterPayments, setFilterPayments] = useState<string[]>([]);
  const [filterScanned, setFilterScanned] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const invalidRange = !!(
    (filterDateFrom && filterDateTo && filterDateFrom > filterDateTo) ||
    (createdFrom && createdTo && createdFrom > createdTo)
  );
  const customerFilterOptions = useMemo(
    () =>
      [
        ...new Map(
          invoices.map((invoice) => [
            invoice.customerId,
            { value: invoice.customerId, label: invoice.companyName },
          ]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [invoices],
  );
  const matchingInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (
          viewDrRaw &&
          String(invoice.drNumber ?? "") !== String(viewDrRaw).trim()
        )
          return false;
        return matchesInvoiceFilters(invoice, {
          customers: filterCustomers,
          categories: filterCategories,
          paymentStatuses: filterPayments,
          scannedStatuses: filterScanned,
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
          month: filterMonth,
          createdFrom,
          createdTo,
          search,
        });
      }),
    [
      invoices,
      viewDrRaw,
      filterCustomers,
      filterDateFrom,
      filterDateTo,
      filterMonth,
      createdFrom,
      createdTo,
      search,
      filterCategories,
      filterPayments,
      filterScanned,
    ],
  );
  const displayInvoices = useMemo(
    () =>
      matchingInvoices.filter(
        (invoice) =>
          !filterStatuses.length || filterStatuses.includes(invoice.status),
      ),
    [matchingInvoices, filterStatuses],
  );
  const report = useMemo(
    () => buildServiceInvoiceSummaryReport(displayInvoices, "all"),
    [displayInvoices],
  );
  const appliedFilters = [
    `Creation date (PH): ${createdFrom || "Any"} to ${createdTo || "Any"}`,
    `Invoice date: ${filterDateFrom || "Any"} to ${filterDateTo || "Any"}`,
    `Invoice month: ${filterMonth || "Any"}`,
    `Customers: ${
      filterCustomers.length
        ? customerFilterOptions
            .filter((option) => filterCustomers.includes(option.value))
            .map((option) => option.label)
            .join(", ")
        : "All"
    }`,
    `Statuses: ${filterStatuses.join(", ") || "All"}`,
    `Categories: ${filterCategories.join(", ") || "All"}`,
    `Payment statuses: ${filterPayments.map((value) => PAYMENT_LABELS[value as keyof typeof PAYMENT_LABELS]).join(", ") || "All"}`,
    `Scanned copies: ${filterScanned.join(", ") || "All"}`,
    `Search: ${search || "None"}`,
    `Delivery receipt: ${viewDrRaw || "All"}`,
  ];
  /* Create modal handlers */
  const openCreateModal = () => {
    setInvoiceNo("");
    setSelectedCustomer("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setLineItems([]);
    setDiscountSettings(defaultDiscount());
    setLinkedDrNumber("");
    setLinkedSalesOrderId("");
    setReferenceMode(null);
    setTechnicianId("");
    setTechnicianName("");
    setPoNo("");
    setTrNo("");
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
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
              ...(field === "description" ? { productId: undefined } : {}),
            }
          : item,
      ),
    );
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveInvoice = async () => {
    if (!referenceMode) {
      toast.error("Choose Sales Order or Legacy TR Number first.");
      return;
    }
    if (
      referenceMode === "SALES_ORDER" &&
      !linkedDrNumber &&
      !linkedSalesOrderId
    ) {
      toast.error("Select a Sales Order or link a Delivery Report.");
      return;
    }
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
    if (!linkedDrNumber && !technicianId) {
      toast.error("Assigned Technician is required before finalizing.");
      return;
    }

    setPrinting(true);
    try {
      const payload = {
        invoiceNo: invoiceNo.trim(),
        date: invoiceDate,
        customerId: selectedCustomer,
        preparedBy,
        discountSettings,
        items: lineItems.map((li) => ({
          productId: li.productId,
          description: li.description,
          quantity: Number(li.quantity) || 0,
          unitPrice: Number(li.unitPrice) || 0,
        })),
        contractId: selectedContractId || undefined,
        drNumber: linkedDrNumber ? parseInt(linkedDrNumber, 10) : undefined,
        referenceMode: referenceMode || "SALES_ORDER",
        salesOrderId: linkedDrNumber
          ? undefined
          : linkedSalesOrderId || undefined,
        poNo,
        trNo,
        assignedTechnicianUserId: technicianId || undefined,
      };
      const res = await serviceInvoiceService.createAndPopulateSheet(payload);
      toast.success("Service invoice recorded!");
      if (res.trackerAssignmentWarning)
        toast.warning(res.trackerAssignmentWarning);
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
    if (!referenceMode) {
      toast.error("Choose Sales Order or Legacy TR Number first.");
      return;
    }
    if (
      referenceMode === "SALES_ORDER" &&
      !linkedDrNumber &&
      !linkedSalesOrderId
    ) {
      toast.error("Select a Sales Order or link a Delivery Report.");
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
        discountSettings,
        items: lineItems.map((li) => ({
          productId: li.productId,
          description: li.description,
          quantity: Number(li.quantity) || 0,
          unitPrice: Number(li.unitPrice) || 0,
        })),
        status: "draft",
        contractId: selectedContractId || undefined,
        drNumber: linkedDrNumber ? parseInt(linkedDrNumber, 10) : undefined,
        referenceMode: referenceMode || "SALES_ORDER",
        salesOrderId: linkedDrNumber
          ? undefined
          : linkedSalesOrderId || undefined,
        poNo,
        trNo,
        assignedTechnicianUserId: technicianId || undefined,
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
      setVoidReason("");
      setEditManualCategories(editTarget.manualCategories ?? []);
      setEditInvoiceNo("");
      setEditDiscountSettings(editTarget.discountSettings ?? defaultDiscount());
      setEditLineItems(
        editTarget.items.map((item) => ({
          productId: item.productId,
          salesOrderItemId: item.salesOrderItemId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );
      setEditDrNumber(editTarget.drNumber?.toString() || "");
      setEditSalesOrderId(editTarget.salesOrderId || "");
      setEditReferenceMode(editTarget.referenceMode || "SALES_ORDER");
      setEditTechnicianId(editTarget.assignedTechnicianUserId || "");
      setEditTechnicianName(editTarget.assignedTechnicianName || "");
      setEditPoNo(editTarget.poNo || "");
      setEditTrNo(editTarget.trNo || "");
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
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              [field]: value,
              ...(field === "description" ? { productId: undefined } : {}),
            }
          : item,
      ),
    );

  /* Edit save handler */
  const handleEditSave = async () => {
    if (!editTarget) return;
    if (
      editReferenceMode === "SALES_ORDER" &&
      !editDrNumber &&
      !editSalesOrderId
    ) {
      toast.error("Select a Sales Order or link a Delivery Report.");
      return;
    }
    setEditSubmitting(true);
    try {
      const payload = {
        invoiceNo:
          editTarget.replacesInvoiceNo && editStatus !== "draft"
            ? editInvoiceNo.trim()
            : undefined,
        date: editDate,
        status: editStatus,
        statusReason: editStatus === "void" ? voidReason : undefined,
        manualCategories:
          editTarget.categorySource === "automatic"
            ? undefined
            : editManualCategories,
        items: editLineItems
          .filter((li) => li.description.trim())
          .map((li) => ({
            productId: li.productId,
            salesOrderItemId: li.salesOrderItemId,
            description: li.description,
            quantity: Number(li.quantity) || 0,
            unitPrice: Number(li.unitPrice) || 0,
          })),
        drNumber: editDrNumber ? parseInt(editDrNumber, 10) : null,
        referenceMode: editReferenceMode,
        salesOrderId: editDrNumber ? null : editSalesOrderId || null,
        poNo: editPoNo,
        trNo: editTrNo,
        assignedTechnicianUserId: editTechnicianId || undefined,
      };
      const res = await serviceInvoiceService.update(
        editTarget.invoiceNo,
        payload,
      );
      const updatedInvoiceNo = res?.invoiceNo ?? editTarget.invoiceNo;
      toast.success(`Invoice ${updatedInvoiceNo} updated.`);
      if (res.trackerAssignmentOutcome === "already_returned") {
        toast.warning(
          "The Document Tracker assignment was already returned and requires manual review.",
        );
      }
      if (res.trackerAssignmentWarning)
        toast.warning(res.trackerAssignmentWarning);

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

  const openManualCompletion = (invoice: ServiceInvoiceSummary) => {
    setCompletionTarget(invoice);
    setCompletionDate(new Date().toISOString().split("T")[0]);
    setCompletionTechnicianId(invoice.assignedTechnicianUserId || "");
    setCompletionNotes("");
  };

  const submitManualCompletion = async () => {
    if (!completionTarget) return;
    setCompletingService(true);
    try {
      await serviceInvoiceService.completeServiceManually(
        completionTarget.invoiceNo,
        {
          completionDate,
          technicianUserId: completionTechnicianId,
          notes: completionNotes,
        },
      );
      toast.success(
        `Service for invoice ${completionTarget.invoiceNo} marked complete.`,
      );
      setCompletionTarget(null);
      fetchList();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to complete service.",
      );
    } finally {
      setCompletingService(false);
    }
  };

  const submitReversal = async () => {
    if (!reversalTarget) return;
    setCompletingService(true);
    try {
      await serviceInvoiceService.reverseManualServiceCompletion(
        reversalTarget.invoiceNo,
        { reversalDate, notes: reversalNotes },
      );
      toast.success(
        `Manual completion for invoice ${reversalTarget.invoiceNo} was reversed.`,
      );
      setReversalTarget(null);
      fetchList();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to reverse manual completion.",
      );
    } finally {
      setCompletingService(false);
    }
  };

  const clearFilters = () => {
    setFilterCustomers([]);
    setFilterCategories([]);
    setFilterStatuses([]);
    setFilterPayments([]);
    setFilterScanned([]);
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMonth("");
    setCreatedFrom("");
    setCreatedTo("");
    setSearch("");
  };
  const filterChips: { key: string; label: string; remove: () => void }[] = [
    ...filterCustomers.map((value) => ({
      key: `customer-${value}`,
      label: `Customer: ${customerFilterOptions.find((option) => option.value === value)?.label || value}`,
      remove: () =>
        setFilterCustomers((values) => values.filter((item) => item !== value)),
    })),
    ...filterCategories.map((value) => ({
      key: `category-${value}`,
      label: `Category: ${value}`,
      remove: () =>
        setFilterCategories((values) =>
          values.filter((item) => item !== value),
        ),
    })),
    ...filterStatuses.map((value) => ({
      key: `status-${value}`,
      label: `Invoice: ${value}`,
      remove: () =>
        setFilterStatuses((values) => values.filter((item) => item !== value)),
    })),
    ...filterPayments.map((value) => ({
      key: `payment-${value}`,
      label: `Payment: ${PAYMENT_LABELS[value as keyof typeof PAYMENT_LABELS]}`,
      remove: () =>
        setFilterPayments((values) => values.filter((item) => item !== value)),
    })),
    ...filterScanned.map((value) => ({
      key: `scan-${value}`,
      label: value === "scanned" ? "Scanned" : "Not scanned",
      remove: () =>
        setFilterScanned((values) => values.filter((item) => item !== value)),
    })),
    ...[
      {
        key: "invoice-from",
        value: filterDateFrom,
        label: "Invoice from",
        reset: () => setFilterDateFrom(""),
      },
      {
        key: "invoice-to",
        value: filterDateTo,
        label: "Invoice to",
        reset: () => setFilterDateTo(""),
      },
      {
        key: "invoice-month",
        value: filterMonth,
        label: "Invoice month",
        reset: () => setFilterMonth(""),
      },
      {
        key: "created-from",
        value: createdFrom,
        label: "Created from",
        reset: () => setCreatedFrom(""),
      },
      {
        key: "created-to",
        value: createdTo,
        label: "Created to",
        reset: () => setCreatedTo(""),
      },
    ]
      .filter((item) => item.value)
      .map((item) => ({
        key: item.key,
        label: `${item.label}: ${item.value}`,
        remove: item.reset,
      })),
  ];
  const toolbarActions = (
    <>
      {isAdmin && (
        <ServiceInvoiceReporting
          report={report}
          filters={appliedFilters}
          loading={loading || invalidRange}
          showSummary={false}
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        aria-expanded={filtersOpen}
        aria-controls="invoice-advanced-filters"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters{filterChips.length > 0 ? ` (${filterChips.length})` : ""}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
        />
      </Button>
    </>
  );
  const filterPanel = (
    <>
      <div
        id="invoice-advanced-filters"
        hidden={!filtersOpen}
        className="rounded-md border bg-muted/20 p-4"
      >
        <div className="grid w-full grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-2">
          <div>
            <Label>Customer</Label>
            <FilterMultiSelect
              label="Customer"
              values={filterCustomers}
              options={customerFilterOptions}
              onChange={setFilterCustomers}
            />
          </div>
          <div>
            <Label htmlFor="invoice-filter-from">Invoice date from</Label>
            <DatePickerInput
              id="invoice-filter-from"
              value={filterDateFrom}
              max={filterDateTo || undefined}
              onChange={(selectedDate) => {
                setFilterDateFrom(selectedDate);
                setFilterMonth("");
              }}
            />
          </div>
          <div>
            <Label htmlFor="invoice-filter-to">Invoice date to</Label>
            <DatePickerInput
              id="invoice-filter-to"
              value={filterDateTo}
              min={filterDateFrom || undefined}
              onChange={(selectedDate) => {
                setFilterDateTo(selectedDate);
                setFilterMonth("");
              }}
            />
          </div>
          <div>
            <Label htmlFor="invoice-filter-month">Invoice month</Label>
            <MonthPickerInput
              id="invoice-filter-month"
              value={filterMonth}
              onChange={(month) => {
                setFilterMonth(month);
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
            />
          </div>
          <div>
            <Label>Payment status</Label>
            <FilterMultiSelect
              label="Payment status"
              values={filterPayments}
              options={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={setFilterPayments}
            />
          </div>
          <div>
            <Label>Scanned copy</Label>
            <FilterMultiSelect
              label="Scanned copy"
              values={filterScanned}
              options={[
                { value: "scanned", label: "Scanned" },
                { value: "not_scanned", label: "Not scanned" },
              ]}
              onChange={setFilterScanned}
            />
          </div>
          <div>
            <Label>Invoice category</Label>
            <FilterMultiSelect
              label="Invoice category"
              values={filterCategories}
              options={[...MANUAL_INVOICE_CATEGORIES, "Uncategorized"].map(
                (value) => ({ value, label: value }),
              )}
              onChange={setFilterCategories}
            />
          </div>
          <div>
            <Label>Creation period (PH)</Label>
            <SearchableSelect
              placeholder="Choose a preset..."
              searchPlaceholder="Search creation periods..."
              options={[
                { value: "all", label: "All creation dates" },
                { value: "today", label: "Today" },
                { value: "week", label: "This week" },
                { value: "month", label: "This month" },
              ]}
              onValueChange={(value) => {
                if (value === "all") {
                  setCreatedFrom("");
                  setCreatedTo("");
                } else {
                  const range = reportRange(
                    value as "today" | "week" | "month",
                  );
                  setCreatedFrom(range.startDate);
                  setCreatedTo(range.endDate);
                }
              }}
            />
          </div>
          <div>
            <Label htmlFor="invoice-created-from">
              Creation date from (PH)
            </Label>
            <DatePickerInput
              id="invoice-created-from"
              value={createdFrom}
              max={createdTo || undefined}
              onChange={(selectedDate) => setCreatedFrom(selectedDate)}
            />
          </div>
          <div>
            <Label htmlFor="invoice-created-to">Creation date to (PH)</Label>
            <DatePickerInput
              id="invoice-created-to"
              value={createdTo}
              min={createdFrom || undefined}
              onChange={(selectedDate) => setCreatedTo(selectedDate)}
            />
          </div>
          <div>
            <Label>Invoice status</Label>
            <FilterMultiSelect
              label="Invoice status"
              values={filterStatuses}
              options={["created", "draft", "cancelled", "void"].map(
                (value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1),
                }),
              )}
              onChange={setFilterStatuses}
            />
          </div>
        </div>
      </div>
      {(filterChips.length > 0 || search) && (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Applied filters"
        >
          {filterChips.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              variant="secondary"
              size="sm"
              className="h-auto max-w-full gap-1 py-1 text-xs"
              aria-label={`Remove ${chip.label}`}
              onClick={chip.remove}
            >
              <span className="truncate">{chip.label}</span>
              <X className="h-3 w-3 shrink-0" />
            </Button>
          ))}
          {search && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-auto max-w-full gap-1 py-1 text-xs"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <span className="truncate">Search: {search}</span>
              <X className="h-3 w-3 shrink-0" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
          >
            Clear all
          </Button>
        </div>
      )}
      {invalidRange && (
        <p role="alert" className="text-sm text-destructive">
          Each start date must be on or before its end date.
        </p>
      )}
    </>
  );

  return (
    <>
      <div className="space-y-6 min-w-0">
        <DocumentRegisterHeader
          eyebrow="Invoice management"
          title="Service Invoices"
          description="Review invoices, scanned copies, and payment labels."
          loading={loading}
          actions={
            <Button onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Create New
            </Button>
          }
          cards={["all", "created", "draft", "cancelled", "void"].map(
            (status) => ({
              label:
                status === "all"
                  ? "Total"
                  : status.charAt(0).toUpperCase() + status.slice(1),
              count: matchingInvoices.filter(
                (invoice) => status === "all" || invoice.status === status,
              ).length,
              selected:
                status === "all"
                  ? filterStatuses.length === 0
                  : filterStatuses.length === 1 && filterStatuses[0] === status,
              onClick: () =>
                setFilterStatuses(status === "all" ? [] : [status]),
            }),
          )}
        />
        <Tabs value={activeTab} onValueChange={changeTab}>
          {isAdmin && (
            <TabsList aria-label="Service invoice views">
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="invoices" className="space-y-6">
            {viewDrRaw && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-blue-800">
                  Showing Service Invoices (SRs) linked to DR #
                  <span className="font-semibold">{viewDrRaw}</span>
                  <span className="text-blue-700/70">
                    {" "}
                    ({displayInvoices.length} found)
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-300 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                  onClick={() => router.replace("/dashboard/service-invoices")}
                >
                  Show All SRs
                </Button>
              </div>
            )}

            <EntityTable
              title="Service Invoices"
              columns={columns}
              data={displayInvoices}
              hideHeader
              searchValue={search}
              onSearchChange={setSearch}
              toolbarFilters={toolbarActions}
              belowToolbar={filterPanel}
              hideTransferButtons
              loading={loading}
              onCreateNew={openCreateModal}
              mobileLayout={{
                primary: ["invoiceNo", "companyName", "status"],
                labels: {
                  paymentStatus: "Payment status",
                  scannedStatus: "Scanned copy",
                  category: "Category",
                  invoiceNo: "Invoice",
                  date: "Date",
                  companyName: "Customer",
                  preparedBy: "Prepared by",
                  total: "Total",
                  status: "Status",
                  lastUpdated: "Updated",
                  actions: "Actions",
                },
              }}
            />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="summary" className="space-y-4">
              <div className="rounded-md border bg-card p-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {toolbarActions}
                  </div>
                  <Input
                    aria-label="Search Service Invoices"
                    placeholder="Search..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-8 w-full sm:w-[220px]"
                  />
                </div>
                {filterPanel}
              </div>
              <ServiceInvoiceReporting
                report={report}
                filters={appliedFilters}
                loading={loading}
                showSummary
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog
        open={!!categoryTarget}
        onOpenChange={(open) => {
          if (!open && !savingCategory) setCategoryTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Category for invoice #{categoryTarget?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          <InvoiceCategoryPicker
            values={manualCategories}
            onChange={setManualCategories}
            disabled={savingCategory}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingCategory}
              onClick={() => setCategoryTarget(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={savingCategory}
              onClick={async () => {
                if (!categoryTarget) return;
                setSavingCategory(true);
                try {
                  await serviceInvoiceService.updateCategory(
                    categoryTarget.invoiceNo,
                    manualCategories,
                  );
                  await fetchList();
                  setCategoryTarget(null);
                  toast.success("Invoice category updated.");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to update invoice category.",
                  );
                } finally {
                  setSavingCategory(false);
                }
              }}
            >
              {savingCategory && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                  Invoice No.{" "}
                  <span className="text-destructive text-xs">
                    (required unless draft)
                  </span>
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
                <DatePickerInput
                  value={invoiceDate}
                  onChange={(selectedDate) => setInvoiceDate(selectedDate)}
                />
              </div>
              {/* The assigned technician is edited next to the Linked DR below. */}
            </div>

            {/* Items Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">Items</Label>
                <Button size="sm" variant="outline" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {/* Header Labels */}
              {lineItems.length > 0 && (
                <div className="flex gap-2 items-center text-xs font-semibold text-muted-foreground px-1">
                  <div className="flex-1 min-w-[200px]">Item / Description</div>
                  <div className="w-24 shrink-0">Qty</div>
                  <div className="w-28 shrink-0">Unit Price</div>
                  <div className="w-28 shrink-0 text-right">Amount</div>
                  {/* Spacer for delete button alignment */}
                  <div className="w-9 shrink-0" />
                </div>
              )}

              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    className="flex-1 uppercase"
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
              <div className="md:col-span-2">
                <InvoiceReferenceTypeSelector
                  mode={referenceMode}
                  disabled={!!linkedDrNumber}
                  onChange={(mode) => {
                    setReferenceMode(mode);
                    setLinkedSalesOrderId("");
                    setPoNo("");
                    setTrNo("");
                  }}
                />
              </div>
              <div className="space-y-1.5 w-full">
                <div className="flex items-center justify-between gap-2">
                  <Label>Linked DR (optional)</Label>
                  {linkedDrNumber && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-1 text-xs"
                      onClick={() => setLinkedDrNumber("")}
                    >
                      Remove DR
                    </Button>
                  )}
                </div>
                <SearchableSelect
                  value={linkedDrNumber}
                  disabled={!referenceMode}
                  onValueChange={(value) => {
                    setLinkedDrNumber(value);
                    if (value) setLinkedSalesOrderId("");
                  }}
                  options={drOptions}
                  placeholder="Select Delivery Receipt"
                />
              </div>
              <div className="space-y-1.5 w-full">
                <div className="flex items-center justify-between gap-2">
                  <Label>
                    Sales Order{" "}
                    {referenceMode === "SALES_ORDER" && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  {linkedSalesOrderId && !linkedDrNumber && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-1 text-xs"
                      onClick={() => setLinkedSalesOrderId("")}
                    >
                      Remove Sales Order
                    </Button>
                  )}
                </div>
                <SearchableSelect
                  value={linkedSalesOrderId}
                  onValueChange={setLinkedSalesOrderId}
                  options={salesOrderOptions}
                  disabled={!!linkedDrNumber || referenceMode !== "SALES_ORDER"}
                  placeholder={
                    linkedDrNumber
                      ? "Supplied by linked DR"
                      : referenceMode === "SALES_ORDER"
                        ? "Select Service Sales Order"
                        : "Not needed for legacy SO / TR number"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Overall discount</Label>
                <InvoiceDiscountEditor
                  orderId={
                    referenceMode === "SALES_ORDER"
                      ? linkedSalesOrderId
                      : undefined
                  }
                  items={lineItems}
                  value={discountSettings}
                  onChange={setDiscountSettings}
                  onSelectLine={(index, salesOrderItemId) =>
                    setLineItems((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, salesOrderItemId } : row,
                      ),
                    )
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>PO Number</Label>
                <Input
                  value={poNo}
                  onChange={(e) => setPoNo(e.target.value)}
                  disabled={!!linkedDrNumber || referenceMode !== "TR_NUMBER"}
                  className={
                    linkedDrNumber || referenceMode !== "TR_NUMBER"
                      ? "bg-muted"
                      : undefined
                  }
                  placeholder="Customer PO Number"
                />
              </div>
              <div className="space-y-1.5">
                <Label>SO / TR Number</Label>
                <Input
                  value={trNo}
                  onChange={(e) => setTrNo(e.target.value)}
                  disabled={!!linkedDrNumber || referenceMode !== "TR_NUMBER"}
                  className={
                    linkedDrNumber || referenceMode !== "TR_NUMBER"
                      ? "bg-muted"
                      : undefined
                  }
                  placeholder="Sales Order or Legacy TR Number"
                />
              </div>
              <div className="space-y-1.5 w-full">
                <Label>
                  Assigned Technician{" "}
                  {!linkedDrNumber && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                {linkedDrNumber ? (
                  <>
                    <Input
                      value={technicianName}
                      readOnly
                      className="bg-muted"
                      placeholder="Loading from Delivery Receipt..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Automatically assigned from DR #{linkedDrNumber}
                    </p>
                  </>
                ) : (
                  <>
                    <SearchableSelect
                      value={technicianId}
                      onValueChange={(id) => {
                        setTechnicianId(id);
                        setTechnicianName(
                          deliveryUsers.find((user) => user.value === id)
                            ?.label || "",
                        );
                      }}
                      options={deliveryUsers}
                      disabled={deliveryUsersLoading || !!deliveryUsersError}
                      placeholder={
                        deliveryUsersLoading
                          ? "Loading eligible users..."
                          : "Select Assigned Technician"
                      }
                      emptyText="No eligible application users found."
                    />
                    {deliveryUsersError && (
                      <p className="text-xs text-destructive">
                        {deliveryUsersError}
                      </p>
                    )}
                  </>
                )}
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
              onClick={handleSaveInvoice}
              disabled={drafting || printing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {printing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Save Invoice
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
            {editTarget?.replacesInvoiceNo && (
              <div className="space-y-2">
                <p>
                  Replaces cancelled invoice #{editTarget.replacesInvoiceNo}
                </p>
                {editTarget.status === "draft" && (
                  <>
                    <Label>New number from physical form</Label>
                    <Input
                      value={editInvoiceNo}
                      onChange={(event) => setEditInvoiceNo(event.target.value)}
                      placeholder="Required when finalizing"
                    />
                  </>
                )}
              </div>
            )}
            {editTarget?.replacementInvoiceNo && (
              <p>Replacement invoice #{editTarget.replacementInvoiceNo}</p>
            )}
            {editTarget?.categorySource === "automatic" ? (
              <p className="text-sm text-muted-foreground">
                Category: {editTarget.category} (from linked Sales Order or PMS
                contract)
              </p>
            ) : (
              <InvoiceCategoryPicker
                values={editManualCategories}
                onChange={setEditManualCategories}
                disabled={editSubmitting}
              />
            )}
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
                <DatePickerInput
                  value={editDate}
                  onChange={(selectedDate) => setEditDate(selectedDate)}
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
                    <SelectItem
                      value="void"
                      disabled={editTarget?.paymentStatus !== "unpaid"}
                    >
                      Void
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editStatus === "void" && (
              <div className="space-y-2">
                <Label htmlFor="void-reason">Reason for voiding *</Label>
                <Textarea
                  id="void-reason"
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="md:col-span-2">
                <InvoiceReferenceTypeSelector
                  mode={editReferenceMode}
                  disabled={!!editDrNumber}
                  onChange={(mode) => {
                    setEditReferenceMode(mode);
                    setEditSalesOrderId("");
                    setEditPoNo("");
                    setEditTrNo("");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Linked DR (optional)</Label>
                  {editDrNumber && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-1 text-xs"
                      onClick={() => setEditDrNumber("")}
                    >
                      Remove DR
                    </Button>
                  )}
                </div>
                <SearchableSelect
                  value={editDrNumber}
                  onValueChange={(value) => {
                    setEditDrNumber(value);
                    if (value) setEditSalesOrderId("");
                  }}
                  options={drOptions}
                  placeholder="Select Delivery Receipt"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>
                    Sales Order{" "}
                    {editReferenceMode === "SALES_ORDER" && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  {editSalesOrderId && !editDrNumber && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-1 text-xs"
                      onClick={() => setEditSalesOrderId("")}
                    >
                      Remove Sales Order
                    </Button>
                  )}
                </div>
                <SearchableSelect
                  value={editSalesOrderId}
                  onValueChange={setEditSalesOrderId}
                  options={salesOrderOptions}
                  disabled={
                    !!editDrNumber || editReferenceMode !== "SALES_ORDER"
                  }
                  placeholder={
                    editDrNumber
                      ? "Supplied by linked DR"
                      : editReferenceMode === "SALES_ORDER"
                        ? "Select Service Sales Order"
                        : "Not needed for legacy SO / TR number"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Overall discount</Label>
                <InvoiceDiscountEditor
                  orderId={
                    editReferenceMode === "SALES_ORDER"
                      ? editSalesOrderId
                      : undefined
                  }
                  items={editLineItems}
                  value={editDiscountSettings}
                  onChange={setEditDiscountSettings}
                  onSelectLine={(index, salesOrderItemId) =>
                    setEditLineItems((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, salesOrderItemId } : row,
                      ),
                    )
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>PO Number</Label>
                <Input
                  value={editPoNo}
                  onChange={(e) => setEditPoNo(e.target.value)}
                  disabled={!!editDrNumber || editReferenceMode !== "TR_NUMBER"}
                  className={
                    editDrNumber || editReferenceMode !== "TR_NUMBER"
                      ? "bg-muted"
                      : undefined
                  }
                  placeholder="Customer PO Number"
                />
              </div>
              <div className="space-y-1.5">
                <Label>SO / TR Number</Label>
                <Input
                  value={editTrNo}
                  onChange={(e) => setEditTrNo(e.target.value)}
                  disabled={!!editDrNumber || editReferenceMode !== "TR_NUMBER"}
                  className={
                    editDrNumber || editReferenceMode !== "TR_NUMBER"
                      ? "bg-muted"
                      : undefined
                  }
                  placeholder="Sales Order or Legacy TR Number"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Assigned Technician{" "}
                  {editDrNumber === "" && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                {editDrNumber ? (
                  <>
                    <Input
                      value={editTechnicianName}
                      readOnly
                      className="bg-muted"
                      placeholder="Loading from Delivery Receipt..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Automatically assigned from DR #{editDrNumber}
                    </p>
                  </>
                ) : (
                  <SearchableSelect
                    value={editTechnicianId}
                    onValueChange={(id) => {
                      setEditTechnicianId(id);
                      setEditTechnicianName(
                        deliveryUsers.find((user) => user.value === id)
                          ?.label || "",
                      );
                    }}
                    options={deliveryUsers}
                    disabled={deliveryUsersLoading || !!deliveryUsersError}
                    placeholder={
                      deliveryUsersLoading
                        ? "Loading eligible users..."
                        : "Select Assigned Technician"
                    }
                    emptyText="No eligible application users found."
                  />
                )}
                {deliveryUsersError && (
                  <p className="text-xs text-destructive">
                    {deliveryUsersError}
                  </p>
                )}
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

              {/* Header Labels */}
              {editLineItems.length > 0 && (
                <div className="flex gap-2 items-center text-xs font-semibold text-muted-foreground px-1">
                  <div className="flex-1 min-w-[200px]">Item / Description</div>
                  <div className="w-24 shrink-0">Qty</div>
                  <div className="w-28 shrink-0">Unit Price</div>
                  <div className="w-28 shrink-0 text-right">Amount</div>
                  {/* Spacer for delete button alignment */}
                  <div className="w-9 shrink-0" />
                </div>
              )}

              {editLineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    className="flex-1 uppercase"
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
            <Button
              onClick={handleEditSave}
              disabled={
                editSubmitting || (editStatus === "void" && !voidReason.trim())
              }
            >
              {editSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!paymentTarget}
        onOpenChange={(open) =>
          !open && !savingPayment && setPaymentTarget(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Payment status - #{paymentTarget?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          <Label>Payment status</Label>
          <Select value={paymentValue} onValueChange={setPaymentValue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Reconcile this label with the legacy payment sheet. No payment
            amounts are recorded here.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingPayment}
              onClick={() => setPaymentTarget(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={savingPayment}
              onClick={async () => {
                if (!paymentTarget || !isAdmin) return;
                setSavingPayment(true);
                try {
                  await serviceInvoiceService.updatePayment(
                    paymentTarget.invoiceNo,
                    paymentValue,
                  );
                  await fetchList();
                  setPaymentTarget(null);
                  toast.success("Payment status updated.");
                } catch {
                  toast.error("Failed to update payment status.");
                } finally {
                  setSavingPayment(false);
                }
              }}
            >
              Save payment status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) =>
          !open && !correctingInvoiceNo && setCancelTarget(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel and create corrected copy - #{cancelTarget?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          <Label htmlFor="cancel-reason">Reason *</Label>
          <Textarea
            id="cancel-reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!correctingInvoiceNo}
              onClick={() => setCancelTarget(null)}
            >
              Back
            </Button>
            <Button
              disabled={!!correctingInvoiceNo || !cancelReason.trim()}
              onClick={async () => {
                if (!cancelTarget) return;
                setCorrectingInvoiceNo(cancelTarget.invoiceNo);
                try {
                  const replacementNo =
                    await serviceInvoiceService.cancelAndCreateCorrectedCopy(
                      cancelTarget.invoiceNo,
                      cancelReason,
                    );
                  const updated = await serviceInvoiceService.getAll();
                  setInvoices(updated);
                  setCancelTarget(null);
                  setEditTarget(
                    updated.find(
                      (invoice) => invoice.invoiceNo === replacementNo,
                    ) || null,
                  );
                  toast.success("Invoice cancelled. Edit the corrected draft.");
                } catch {
                  toast.error(
                    "Could not cancel invoice. Check payment status and try again.",
                  );
                } finally {
                  setCorrectingInvoiceNo(null);
                }
              }}
            >
              Cancel and create corrected copy
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

      <Dialog
        open={!!completionTarget}
        onOpenChange={(open) => !open && setCompletionTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Mark Service Complete — Invoice #{completionTarget?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Completion Date <span className="text-destructive">*</span>
              </Label>
              <DatePickerInput
                value={completionDate}
                onChange={(selectedDate) => setCompletionDate(selectedDate)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Technician / Responsible Person{" "}
                <span className="text-destructive">*</span>
              </Label>
              <SearchableSelect
                value={completionTechnicianId}
                onValueChange={setCompletionTechnicianId}
                options={deliveryUsers}
                placeholder="Select technician or responsible person"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={completionNotes}
                onChange={(event) => setCompletionNotes(event.target.value)}
                placeholder="Describe the completed service"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This completes every active service line on the linked Sales
              Order.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompletionTarget(null)}
              disabled={completingService}
            >
              Cancel
            </Button>
            <Button
              onClick={submitManualCompletion}
              disabled={
                completingService ||
                !completionDate ||
                !completionTechnicianId ||
                !completionNotes.trim()
              }
            >
              {completingService && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!reversalTarget}
        onOpenChange={(open) => !open && setReversalTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Reverse Manual Completion — Invoice #{reversalTarget?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Reversal Date <span className="text-destructive">*</span>
              </Label>
              <DatePickerInput
                value={reversalDate}
                onChange={(selectedDate) => setReversalDate(selectedDate)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Reversal Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={reversalNotes}
                onChange={(event) => setReversalNotes(event.target.value)}
                placeholder="Explain why this completion is being reversed"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReversalTarget(null)}
              disabled={completingService}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitReversal}
              disabled={
                completingService || !reversalDate || !reversalNotes.trim()
              }
            >
              {completingService && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reverse Completion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        description={`Delete service invoice "${deleteTarget?.invoiceNo}"? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Hidden input for uploading a scanned Service Invoice */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
    </>
  );
}

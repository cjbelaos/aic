//customer-contracts page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ExternalLink, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EntityTable } from "@/components/ui/entity-table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker"; // Import the DatePicker component
import { Textarea } from "@/components/ui/textarea";
import { CompanyContactsDrawer } from "@/components/company-contacts-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { effectiveContractStatus, manilaToday } from "@/lib/contractStatus";

import { serviceFrequencyForItems } from "@/lib/contractServiceFrequency";

// Services
import companyService from "@/lib/services/company.service";
import productService from "@/lib/services/product.service";
import contractService from "@/lib/services/contract.service";
import contractItemService from "@/lib/services/contract-item.service";

// Types
import {
  ContractWithItems,
  AgreementType,
  ContractStatus,
  PaperworkStatus,
  NotarizedHardcopyStatus,
  FrequencyType,
} from "@/types/contract";
import { Company } from "@/types/company";
import { Product } from "@/types/product";
import { format } from "date-fns"; // Import date-fns for formatting

const FREQUENCY_OPTIONS: FrequencyType[] = [
  "Monthly",
  "Quarterly",
  "Semi-Annual",
  "Annual",
  "One-Time",
];

const AGREEMENT_TYPE_OPTIONS: AgreementType[] = ["Contract", "PO"];
const CONTRACT_STATUS_OPTIONS: ContractStatus[] = [
  "Active",
  "Expired",
  "Closed",
  "Inactive",
];

// Currency formatter for monthly service fee display
const formatCurrency = (value?: number) =>
  value != null && !Number.isNaN(value)
    ? new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(value)
    : "None";

function exportToExcel(
  rows: GroupedCustomerContract[],
  productMap: Map<string, string>,
) {
  if (rows.length === 0) {
    toast.error("No contract records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Contract Entitlements");
  worksheet.columns = [
    { header: "Contract ID", key: "contractId", width: 16 },
    { header: "Customer", key: "customer", width: 30 },
    { header: "Agreement Type", key: "agreementType", width: 16 },
    { header: "PO Number", key: "poNumber", width: 18 },
    { header: "Start Date", key: "startDate", width: 15 },
    { header: "End Date", key: "endDate", width: 15 },
    { header: "Status", key: "status", width: 12 },
    { header: "Paperwork", key: "paperworkStatus", width: 16 },
    { header: "Notarized Hardcopy on File", key: "notarizedHardcopyStatus", width: 28 },
    { header: "Service Fee", key: "monthlyServiceFee", width: 20 },
    { header: "Contract Billing Frequency", key: "serviceFeeFrequency", width: 22 },
    { header: "Entitlement Items", key: "items", width: 60 },
  ];

  rows.forEach((contract) => {
    worksheet.addRow({
      contractId: contract.id,
      customer: contract.companyName,
      agreementType: contract.agreementType,
      poNumber: contract.poNumber || "",
      startDate: contract.startDate,
      endDate: contract.endDate,
      status: effectiveContractStatus(contract),
      paperworkStatus: contract.paperworkStatus ?? "Pending",
      notarizedHardcopyStatus: contract.notarizedHardcopyStatus ?? "Unknown",
      monthlyServiceFee: contract.monthlyServiceFee ?? "",
      serviceFeeFrequency: contract.serviceFeeFrequency ?? "Monthly",
      items: contract.items
        .map((item) => `${productMap.get(item.productId || item.productCode) || item.productCode} (${item.productCode}) — ${item.entitledQty} / ${item.frequency}`)
        .join("; "),
    });
  });
  worksheet.getRow(1).font = { bold: true };
  worksheet.getColumn("monthlyServiceFee").numFmt = '₱#,##0.00';

  workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contract-entitlements.xlsx";
    link.click();
    window.URL.revokeObjectURL(url);
  }).catch((err) => {
    console.error("Excel generation failed:", err);
    toast.error("Failed to generate Excel download file.");
  });
}

/* ── Item State inside Form ─────────────────────────────── */
interface ContractFormItem {
  id?: string; // Existing item has an ID
  productId: string;
  entitledQty: number;
  frequency: FrequencyType;
  status: "Active" | "Inactive";
}

interface CustomerContractFormState {
  customerId: string;
  description: string;
  agreementType: AgreementType;
  poNumber: string;
  startDate: Date | undefined; // Changed from string to Date
  endDate: Date | undefined; // Changed from string to Date
  status: ContractStatus;
  paperworkStatus: PaperworkStatus;
  notarizedHardcopyStatus: NotarizedHardcopyStatus;
  monthlyServiceFee: string;
  serviceFeeFrequency: "Monthly" | "Quarterly";
  notes: string;
  items: ContractFormItem[];
}

const EMPTY_FORM_ITEM: ContractFormItem = {
  productId: "",
  entitledQty: 1,
  frequency: "Monthly",
  status: "Active",
};

const EMPTY_FORM: CustomerContractFormState = {
  customerId: "",
  description: "",
  agreementType: "Contract",
  poNumber: "",
  startDate: undefined,
  endDate: undefined,
  status: "Active",
  paperworkStatus: "Pending",
  notarizedHardcopyStatus: "Unknown",
  monthlyServiceFee: "",
  serviceFeeFrequency: "Monthly",
  notes: "",
  items: [],
};

/* ── Grouped Customer Data Structure for Display ────────── */
interface GroupedCustomerContract extends ContractWithItems {
  companyName: string; // Denormalized for display
}

/* ── Page ───────────────────────────────────────────────── */
export default function CustomerContractsPage() {
  const [statusFilter, setStatusFilter] = useState("All");
  const [paperworkFilter, setPaperworkFilter] = useState("All");
  const [today, setToday] = useState(() => manilaToday());
  useEffect(() => {
    const refresh = () => setToday(manilaToday());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const [data, setData] = useState<ContractWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [referencesLoaded, setReferencesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupedCustomerContract | null>(
    null,
  );
  const [form, setForm] = useState<CustomerContractFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] =
    useState<GroupedCustomerContract | null>(null);
  const [viewTarget, setViewTarget] =
    useState<GroupedCustomerContract | null>(null);
  const [contactCompany, setContactCompany] = useState<Company | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState<"soft" | "signed" | null>(null);
  const [notesTarget, setNotesTarget] = useState<GroupedCustomerContract | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  // Reference data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);

  // Fast Product Lookup Map O(1)
  const productMap = useMemo(() => {
    const map = new Map<string, string>();
    productsList.forEach((p) => {
      map.set(p.code, p.name);
      if (p.productId) map.set(p.productId, p.name);
    });
    return map;
  }, [productsList]);

  // Company Lookup Map O(1)
  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => {
      map.set(c.companyId, c.companyName);
    });
    return map;
  }, [companies]);

  // Preserve one row per ContractId. Customer names are hydrated for display,
  // but never used as an identity/grouping key.
  const groupedContracts = useMemo<GroupedCustomerContract[]>(() => {
    return data.map((contract) => ({
      ...contract,
      companyName: companyMap.get(contract.companyId) || "Unknown",
      items: contract.items.filter((item) => item.contractId === contract.id),
    }));
  }, [data, companyMap]);

  /* ── Columns Definition ───────────────────────────────── */
  const filteredContracts = useMemo(() => groupedContracts.filter(contract =>
    (statusFilter === "All" || effectiveContractStatus(contract, today) === statusFilter) &&
    (paperworkFilter === "All" || (contract.paperworkStatus ?? "Pending") === paperworkFilter)
  ), [groupedContracts, statusFilter, paperworkFilter, today]);

  const columns = useMemo<ColumnDef<GroupedCustomerContract>[]>(
    () => [
      {
        accessorKey: "companyName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Client / Company <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="block min-w-52 max-w-72 whitespace-normal font-semibold leading-relaxed">{row.original.companyName}</span>
        ),
      },
      {
        accessorKey: "agreementType",
        header: "Agreement",
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-xs">
            {row.original.agreementType}
          </Badge>
        ),
      },
      {
        accessorKey: "poNumber",
        header: "PO Number",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.poNumber || "N/A"}
          </span>
        ),
      },
      {
        accessorKey: "startDate",
        header: "Start Date",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.startDate
              ? new Date(row.original.startDate).toLocaleDateString()
              : "N/A"}
          </span>
        ),
      },
      {
        accessorKey: "endDate",
        header: "End Date",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.endDate
              ? new Date(row.original.endDate).toLocaleDateString()
              : "N/A"}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: contract => effectiveContractStatus(contract, today),
        header: "Status",
        cell: ({ row }) => {
          const status = effectiveContractStatus(row.original, today);
          const tone = status === "Active"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : status === "Expired"
              ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
              : "bg-muted text-muted-foreground";
          return <Badge variant="outline" className={tone}>{status}</Badge>;
        },
      },
      { accessorKey: "paperworkStatus", header: "Paperwork", cell: ({ row }) => <Badge variant="outline" className={row.original.paperworkStatus === "Complete" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-400"}>{row.original.paperworkStatus ?? "Pending"}</Badge> },
      { accessorKey: "notarizedHardcopyStatus", header: () => <span className="block whitespace-normal leading-tight">Notarized copy<br /><span className="font-normal text-muted-foreground">on file</span></span>, cell: ({ row }) => row.original.notarizedHardcopyStatus ?? "Unknown" },
      {
        accessorKey: "monthlyServiceFee",
        id: "monthlyServiceFee",
        header: "Service Fee",
        cell: ({ row }) => (
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatCurrency(row.original.monthlyServiceFee)}{(row.original.monthlyServiceFee ?? 0) > 0 && <span className="ml-1 text-xs text-muted-foreground">/ {row.original.serviceFeeFrequency === "Quarterly" ? "quarter" : "month"}</span>}
          </span>
        ),
      },
      {
        id: "notes",
        header: "Notes",
        cell: ({ row }) => {
          const hasNotes = Boolean(row.original.notes?.trim());
          const openNotes = (event: React.MouseEvent) => {
            event.stopPropagation();
            setNotesTarget(row.original);
            setNotesDraft(row.original.notes || "");
          };
          return (
            <button
              type="button"
              onClick={openNotes}
              aria-label={`${hasNotes ? "Edit" : "Add"} notes for ${row.original.companyName}`}
              className="group block w-48 max-w-full rounded-md p-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {hasNotes ? (
                <>
                  <span className="line-clamp-2 whitespace-normal break-words leading-relaxed">{row.original.notes}</span>
                  <span className="mt-1 block text-xs text-muted-foreground group-hover:text-foreground">Edit notes</span>
                </>
              ) : <span className="text-muted-foreground group-hover:text-foreground">+ Add notes</span>}
            </button>
          );
        },
      },
      {
        id: "totalProducts",
        header: "Entitlements",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-semibold">
            {row.original.items.length === 0
              ? "None"
              : `${row.original.items.length} Product${
                  row.original.items.length > 1 ? "s" : ""
                }`}
          </Badge>
        ),
      },
    ],
    [today],
  );

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const contracts = await contractService.getAll();
      const items = await contractItemService.getAll();

      const contractsWithItems: ContractWithItems[] = contracts.map(
        (contract) => ({
          ...contract,
          items: items.filter((item) => item.contractId === contract.id),
        }),
      );
      setData(contractsWithItems);
    } catch (err) {
      console.error("Error loading contracts:", err);
      toast.error("Failed to load customer contracts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const [companyResult, productResult] = await Promise.all([
          companyService.getAll(),
          productService.getAll(),
        ]);

        setCompanies(Array.isArray(companyResult) ? companyResult : []);
        setProductsList(Array.isArray(productResult) ? productResult : []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load reference data.");
      } finally {
        setReferencesLoaded(true);
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    if (!referencesLoaded) return;
    const timer = window.setTimeout(() => void loadContracts(), 0);
    return () => window.clearTimeout(timer);
  }, [referencesLoaded, loadContracts]);

  const customerOptions = useMemo(
    () =>
      companies.map((c) => ({
        value: c.companyId,
        label: c.companyName,
      })),
    [companies],
  );

  const productOptions = useMemo(
    () =>
      productsList.map((p) => ({
        value: p.productId || p.id,
        label: p.name ? `${p.name} (${p.code})` : p.code,
      })),
    [productsList],
  );

  const openCreate = () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, startDate: today, endDate: nextYear });
    setError("");
    setModalOpen(true);
  };

  // Max end date: 100 years from today
  const endDateMax = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 100);
    return d;
  }, []);

  const todayStart = useMemo(() => new Date(), []);

  const openEdit = (row: GroupedCustomerContract) => {
    setEditTarget(row);
    setForm({
      customerId: row.companyId,
      description: row.description || "",
      agreementType: row.agreementType,
      poNumber: row.poNumber || "",
      startDate: row.startDate ? new Date(row.startDate) : undefined,
      endDate: row.endDate ? new Date(row.endDate) : undefined,
      status: row.status,
      paperworkStatus: row.paperworkStatus ?? "Pending",
      notarizedHardcopyStatus: row.notarizedHardcopyStatus ?? "Unknown",
      monthlyServiceFee:
        row.monthlyServiceFee != null ? String(row.monthlyServiceFee) : "",
      serviceFeeFrequency: row.serviceFeeFrequency ?? "Monthly",
      notes: row.notes || "",
      items: row.items.map((item) => ({
        id: item.id,
        productId: item.productId || item.productCode,
        entitledQty: item.entitledQty,
        frequency: item.frequency,
        status: item.status,
      })),
    });
    setError("");
    setModalOpen(true);
  };

  const addProductRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...EMPTY_FORM_ITEM }],
    }));
  };

  const effectiveServiceFrequency = serviceFrequencyForItems(form.items, form.serviceFeeFrequency);
  const allItemsQuarterly = form.items.length > 0 && form.items.every(item => item.frequency === "Quarterly");

  const removeProductRow = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateProductRow = <K extends keyof ContractFormItem>(
    index: number,
    field: K,
    value: ContractFormItem[K],
  ) => {
    setForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  // Helper to format date for API
  const formatDateForAPI = (date: Date | undefined): string => {
    if (!date) return "";
    return format(date, "yyyy-MM-dd");
  };

  const handleSave = async () => {
    if (!form.customerId) {
      setError("Customer is required.");
      return;
    }
    if (!form.startDate) {
      setError("Start Date is required.");
      return;
    }
    if (!form.endDate) {
      setError("End Date is required.");
      return;
    }
    if (form.items.length === 0 && !form.monthlyServiceFee) {
      setError("Provide at least one product item or a service fee.");
      return;
    }

    const seenProducts = new Set<string>();
    for (let i = 0; i < form.items.length; i++) {
      const item = form.items[i];
      if (!item.productId) {
        setError(`Product is required for item #${i + 1}.`);
        return;
      }
      if (seenProducts.has(item.productId)) {
        setError(`Duplicate product selection found for item #${i + 1}.`);
        return;
      }
      seenProducts.add(item.productId);

      if (item.entitledQty < 1) {
        setError(`Entitled quantity must be at least 1 for item #${i + 1}.`);
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      let contractId: string;

      const startDateStr = formatDateForAPI(form.startDate);
      const endDateStr = formatDateForAPI(form.endDate);

      if (editTarget) {
        contractId = editTarget.id;

        // Update contract header
        await contractService.update({
          id: contractId,
          companyId: form.customerId,
          description: form.description || undefined,
          agreementType: form.agreementType,
          poNumber: form.poNumber || undefined,
          startDate: startDateStr,
          endDate: endDateStr,
          status: form.status,
          monthlyServiceFee: form.monthlyServiceFee
            ? parseFloat(form.monthlyServiceFee)
            : undefined,
          serviceFeeFrequency: effectiveServiceFrequency,
          paperworkStatus: form.paperworkStatus,
          notarizedHardcopyStatus: form.notarizedHardcopyStatus,
          notes: form.notes.trim(),
        });

        // Handle items: compare and sync
        const existingItems = editTarget.items;
        const formItems = form.items;

        // Find items to delete (exist in DB but not in form)
        const itemsToDelete = existingItems.filter(
          (existing) => !formItems.some((form) => form.id === existing.id),
        );

        // Find items to create (exist in form but not in DB)
        const itemsToCreate = formItems.filter(
          (form) => !existingItems.some((existing) => existing.id === form.id),
        );

        // Find items to update (exist in both but may have changes)
        const itemsToUpdate = formItems.filter((form) =>
          existingItems.some((existing) => existing.id === form.id),
        );

        // Delete items that were removed
        if (itemsToDelete.length > 0) {
          await Promise.all(
            itemsToDelete.map((item) => {
              if (item.contractId !== contractId) throw new Error(`Entitlement ${item.id} does not belong to contract ${contractId}.`);
              return contractItemService.delete(item.id, contractId);
            }),
          );
        }

        // Update items that exist in both (sequential)
        for (const formItem of itemsToUpdate) {
          const existingItem = existingItems.find(
            (e) => e.id === formItem.id,
          );
          if (existingItem) {
            if (existingItem.contractId !== contractId) throw new Error(`Entitlement ${existingItem.id} does not belong to contract ${contractId}.`);
            // Only update if there are changes
            if (
              existingItem.productId !== formItem.productId ||
              existingItem.entitledQty !== formItem.entitledQty ||
              existingItem.frequency !== formItem.frequency ||
              existingItem.status !== formItem.status
            ) {
              await contractItemService.update({
                id: formItem.id!,
                contractId,
                productId: formItem.productId,
                productCode: existingItem.productCode,
                entitledQty: formItem.entitledQty,
                frequency: formItem.frequency,
                status: formItem.status,
              });
            }
          }
        }

        // Create new items (sequential to avoid race conditions)
        for (const item of itemsToCreate) {
          await contractItemService.create({
            contractId,
            productId: item.productId,
            productCode: "",
            entitledQty: item.entitledQty,
            frequency: item.frequency,
            status: item.status,
          });
        }
      } else {
        // Creating new contract
        const newContract = await contractService.create({
          companyId: form.customerId,
          description: form.description || undefined,
          agreementType: form.agreementType,
          poNumber: form.poNumber || undefined,
          startDate: startDateStr,
          endDate: endDateStr,
          status: form.status,
          monthlyServiceFee: form.monthlyServiceFee
            ? parseFloat(form.monthlyServiceFee)
            : undefined,
          serviceFeeFrequency: effectiveServiceFrequency,
          paperworkStatus: form.paperworkStatus,
          notarizedHardcopyStatus: form.notarizedHardcopyStatus,
          notes: form.notes.trim(),
        });

        if (!newContract) throw new Error("Failed to create contract.");
        contractId = newContract.id;

        // Create all items for new contract (sequential to avoid race conditions)
        for (const item of form.items) {
          await contractItemService.create({
            contractId,
            productId: item.productId,
            productCode: "",
            entitledQty: item.entitledQty,
            frequency: item.frequency,
            status: item.status,
          });
        }
      }

      await loadContracts();
      toast.success(
        `Contract ${editTarget ? "updated" : "created"} for "${
          companyMap.get(form.customerId) || form.customerId
        }".`,
      );
      setModalOpen(false);
    } catch (err: unknown) {
      console.error("Save error:", err);
      const apiErrorMsg =
        (typeof err === "object" && err !== null && "response" in err && typeof err.response === "object" && err.response !== null && "data" in err.response && typeof err.response.data === "object" && err.response.data !== null && "error" in err.response.data ? String(err.response.data.error) : undefined) ||
        (err instanceof Error ? err.message : undefined) ||
        "Server error. Please try again.";
      setError(apiErrorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await contractService.delete(deleteTarget.id);
      await loadContracts();
      toast.success(`Deleted contract for "${deleteTarget.companyName}".`);
    } catch (err: unknown) {
      console.error("Delete error:", err);
      const apiErrorMsg =
        (typeof err === "object" && err !== null && "response" in err && typeof err.response === "object" && err.response !== null && "data" in err.response && typeof err.response.data === "object" && err.response.data !== null && "error" in err.response.data ? String(err.response.data.error) : undefined) ||
        (err instanceof Error ? err.message : undefined) ||
        "Failed to delete contract.";
      toast.error(apiErrorMsg);
    } finally {
      setDeleteTarget(null);
      setSaving(false);
    }
  };

  const handleDocumentUpload = async (
    documentType: "soft" | "signed",
    file?: File,
  ) => {
    if (!file || !viewTarget) return;

    setUploadingDocument(documentType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contractId", viewTarget.id);
      formData.append("documentType", documentType);
      const response = await fetch("/api/contracts/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { fileLink?: string; error?: string };
      if (!response.ok || !result.fileLink) {
        throw new Error(result.error || "Failed to upload contract document.");
      }
      await loadContracts();
      setViewTarget((current) => current
        ? {
            ...current,
            ...(documentType === "soft"
              ? { softCopyDriveLink: result.fileLink }
              : { scannedSignedCopyDriveLink: result.fileLink }),
          }
        : current);
      toast.success(`${documentType === "soft" ? "Soft copy" : "Scanned signed copy"} uploaded.`);
    } catch (error) {
      console.error("Contract document upload failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload contract document.");
    } finally {
      setUploadingDocument(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!notesTarget) return;
    setNotesSaving(true);
    try {
      await contractService.update({
        id: notesTarget.id,
        notes: notesDraft.trim(),
      });
      await loadContracts();
      toast.success(notesDraft.trim() ? "Contract notes saved." : "Contract notes cleared.");
      setNotesTarget(null);
      setNotesDraft("");
    } catch (error) {
      console.error("Failed to save contract notes:", error);
      toast.error("Failed to save contract notes.");
    } finally {
      setNotesSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-6 [&_td]:py-3 [&_th]:bg-muted/40 [&_th]:text-xs [&_th]:text-muted-foreground">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Customer Contracts</h1>
          <p className="text-sm text-muted-foreground">Manage customer agreements, paperwork, and product entitlements.</p>
        </div>
        <Button onClick={openCreate} className="shrink-0 gap-2"><Plus className="size-4" />New contract</Button>
      </header>
      <EntityTable
        title="Customer Contracts"
        hideHeader
        hideImportButton
        columns={columns}
        data={filteredContracts}
        belowToolbar={
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2 sm:w-48">
              <Label htmlFor="contract-status-filter" className="text-xs font-medium text-muted-foreground">Contract status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="contract-status-filter" className="w-full bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{["All", ...CONTRACT_STATUS_OPTIONS].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All statuses" : value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:w-48">
              <Label htmlFor="paperwork-status-filter" className="text-xs font-medium text-muted-foreground">Paperwork status</Label>
              <Select value={paperworkFilter} onValueChange={setPaperworkFilter}>
                <SelectTrigger id="paperwork-status-filter" className="w-full bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{["All", "Pending", "Complete"].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All paperwork" : value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(statusFilter !== "All" || paperworkFilter !== "All") && (
              <Button variant="ghost" onClick={() => { setStatusFilter("All"); setPaperworkFilter("All"); }}>Clear filters</Button>
            )}
          </div>
        }
        loading={loading}
        onCreateNew={openCreate}
        onView={setViewTarget}
        onEdit={openEdit}
        onDelete={(row) => setDeleteTarget(row)}
        onExport={(rows) => exportToExcel(rows, productMap)}
        mobileLayout={{ primary: ["companyName", "agreementType", "status", "notes"], labels: { companyName: "Customer", agreementType: "Agreement", poNumber: "PO number", startDate: "Start date", endDate: "End date", monthlyServiceFee: "Service fee", notes: "Notes", totalProducts: "Entitlements", paperworkStatus: "Paperwork", notarizedHardcopyStatus: "Notarized Hardcopy on File", status: "Status", actions: "Actions" } }}
        getRowId={(row) => row.id}
      />
      </div>

      <Dialog
        open={!!notesTarget}
        onOpenChange={(open) => {
          if (!open && !notesSaving) {
            setNotesTarget(null);
            setNotesDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Contract Notes</DialogTitle>
            <DialogDescription>
              {notesTarget ? `${notesTarget.companyName} · ${notesTarget.id}` : "Internal contract notes"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="Add follow-up reminders, renewal discussions, or other internal notes"
            rows={7}
            disabled={notesSaving}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesTarget(null)} disabled={notesSaving}>Cancel</Button>
            <Button onClick={handleSaveNotes} disabled={notesSaving}>
              {notesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Contract</DialogTitle>
            <DialogDescription>
              {viewTarget
                ? `${viewTarget.companyName} · ${viewTarget.id}`
                : "Selected contract details"}
            </DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Agreement</p><p className="mt-1 font-medium">{viewTarget.agreementType}</p></div>
                <div><p className="text-xs text-muted-foreground">PO Number</p><p className="mt-1 font-medium">{viewTarget.poNumber || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Start Date</p><p className="mt-1 font-medium">{viewTarget.startDate || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">End Date</p><p className="mt-1 font-medium">{viewTarget.endDate || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><Badge variant={effectiveContractStatus(viewTarget, today) === "Active" ? "default" : "destructive"}>{effectiveContractStatus(viewTarget, today)}</Badge></div></div>
                <div><p className="text-xs text-muted-foreground">Paperwork</p><p>{viewTarget.paperworkStatus ?? "Pending"}</p></div>
                <div><p className="text-xs text-muted-foreground">Notarized Hardcopy on File</p><p>{viewTarget.notarizedHardcopyStatus ?? "Unknown"}</p></div>
                <div><p className="text-xs text-muted-foreground">{viewTarget.serviceFeeFrequency ?? "Monthly"} Service Fee</p><p className="mt-1 font-medium">{formatCurrency(viewTarget.monthlyServiceFee)}</p></div>
                {(viewTarget.monthlyServiceFee ?? 0) > 0 && <div><p className="text-xs text-muted-foreground">Contract Billing Frequency</p><p className="mt-1 font-medium">{viewTarget.serviceFeeFrequency ?? "Monthly"}</p></div>}
                {viewTarget.description && <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="mt-1 font-medium">{viewTarget.description}</p></div>}
                {viewTarget.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap font-medium">{viewTarget.notes}</p></div>}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Entitlement Items ({viewTarget.items.length})</h3>
                {viewTarget.items.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">This is a service-only contract with no product entitlements.</p>
                ) : (
                  <div className="overflow-hidden rounded-md border">
                    <Table>
                      <TableHeader className="bg-muted/50"><TableRow><TableHead>Product</TableHead><TableHead>Code</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Frequency</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>{viewTarget.items.map((item) => <TableRow key={item.id || item.productCode}><TableCell className="font-medium">{productMap.get(item.productId || item.productCode) || item.productCode}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{item.productCode}</TableCell><TableCell className="text-right tabular-nums">{item.entitledQty}</TableCell><TableCell>{item.frequency}</TableCell><TableCell><Badge variant={item.status === "Active" ? "secondary" : "destructive"}>{item.status}</Badge></TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Contract Documents</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["soft", "Soft Copy", viewTarget.softCopyDriveLink],
                    ["signed", "Scanned Signed Copy", viewTarget.scannedSignedCopyDriveLink],
                  ] as const).map(([documentType, label, link]) => (
                    <div key={documentType} className="rounded-lg border p-3 space-y-3">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{link ? "A copy has been uploaded." : "No copy uploaded yet."}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {link && (
                          <Button variant="outline" size="sm" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                          </Button>
                        )}
                        <Button asChild variant="outline" size="sm" disabled={uploadingDocument !== null}>
                          <label className="cursor-pointer">
                            {uploadingDocument === documentType ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                            {link ? "Replace" : "Upload"}
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                              disabled={uploadingDocument !== null}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                void handleDocumentUpload(documentType, file);
                              }}
                            />
                          </label>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!viewTarget) return;
                const company = companies.find(
                  (item) => item.companyId === viewTarget.companyId,
                );
                if (!company) {
                  toast.error("Customer details could not be found.");
                  return;
                }
                setViewTarget(null);
                setContactCompany(company);
              }}
              disabled={!viewTarget || !companies.some((item) => item.companyId === viewTarget.companyId)}
            >
              View Customer Contacts
            </Button>
            <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompanyContactsDrawer
        company={contactCompany}
        open={!!contactCompany}
        onOpenChange={(open) => !open && setContactCompany(null)}
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(v) => {
          if (!saving) setModalOpen(v);
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-5 pr-12 text-left sm:px-6">
            <DialogTitle>
              {editTarget ? "Edit Customer Contract" : "Add Customer Contract"}
            </DialogTitle>
            <DialogDescription>
              Complete the contract details and add product entitlements.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto space-y-5 px-4 py-5 sm:px-6">
            {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

            <section className="space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Agreement details</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer Name */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-customer">Customer *</Label>
                <SearchableSelect
                  triggerProps={{ id: "cc-customer" }}
                  value={form.customerId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, customerId: v }))
                  }
                  options={customerOptions}
                  placeholder="Select customer"
                  searchPlaceholder="Search customers..."
                  disabled={saving || !!editTarget}
                />
              </div>
              {/* Agreement Type */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-agreement-type">Agreement Type *</Label>
                <Select
                  value={form.agreementType}
                  onValueChange={(v: AgreementType) =>
                    setForm((f) => ({ ...f, agreementType: v }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="cc-agreement-type" className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGREEMENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* PO Number */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-po-number">PO Number (Optional)</Label>
                <Input
                  id="cc-po-number"
                  value={form.poNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, poNumber: e.target.value }))
                  }
                  disabled={saving}
                  placeholder="Purchase Order Number"
                />
              </div>
              {/* Status */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-status">Status *</Label>
                <Select
                  value={form.status}
                  onValueChange={(v: ContractStatus) =>
                    setForm((f) => ({ ...f, status: v }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="cc-status" className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Description */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cc-description">Description (Optional)</Label>
                <Input
                  id="cc-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  disabled={saving}
                  placeholder="Contract description"
                />
              </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Contract period</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Start Date - Updated to use DatePicker */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-start-date">Start Date *</Label>
                <DatePicker
                  id="cc-start-date"
                  disabled={saving}
                  value={form.startDate}
                  onChange={(date) =>
                    setForm((f) => {
                      const nextYear = date ? new Date(date) : undefined;
                      if (nextYear) nextYear.setFullYear(nextYear.getFullYear() + 1);
                      return { ...f, startDate: date, endDate: nextYear };
                    })
                  }
                />
              </div>
              {/* End Date - Updated to use DatePicker */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-end-date">End Date *</Label>
                <DatePicker
                  id="cc-end-date"
                  value={form.endDate}
                  onChange={(date) => setForm((f) => ({ ...f, endDate: date }))}
                  disabled={saving || (form.startDate ? { before: form.startDate } : undefined)}
                  startMonth={todayStart}
                  endMonth={endDateMax}
                />
              </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Service billing</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Monthly Service Fee */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-monthly-fee">{effectiveServiceFrequency} Service Fee (₱)</Label>
                <Input
                  id="cc-monthly-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlyServiceFee}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monthlyServiceFee: e.target.value }))
                  }
                  disabled={saving}
                  placeholder="e.g., 20000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-service-frequency">Contract Billing Frequency</Label>
                <Select
                  value={effectiveServiceFrequency}
                  onValueChange={(value: "Monthly" | "Quarterly") =>
                    setForm((f) => ({ ...f, serviceFeeFrequency: value }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger disabled={allItemsQuarterly} id="cc-service-frequency" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {allItemsQuarterly && <p className="text-xs text-muted-foreground sm:col-span-2">Billing is quarterly because every product entitlement renews quarterly.</p>}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Paperwork &amp; internal notes</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="cc-paperwork">Paperwork Status</Label><Select value={form.paperworkStatus} onValueChange={(value: PaperworkStatus) => setForm(f => ({ ...f, paperworkStatus: value }))} disabled={saving}><SelectTrigger id="cc-paperwork" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["Pending", "Complete"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="cc-hardcopy">Notarized Hardcopy on File</Label><Select value={form.notarizedHardcopyStatus} onValueChange={(value: NotarizedHardcopyStatus) => setForm(f => ({ ...f, notarizedHardcopyStatus: value }))} disabled={saving}><SelectTrigger id="cc-hardcopy" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["Unknown", "Yes", "No"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cc-notes">Notes (Internal)</Label>
                <Textarea
                  id="cc-notes"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  disabled={saving}
                  placeholder="Follow-up reminders, renewal discussions, or other internal notes"
                  rows={3}
                />
              </div>
            </section>

            {/* Product Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Product entitlements <span className="ml-1 text-muted-foreground">({form.items.length})</span></h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addProductRow}
                  disabled={saving}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              {form.items.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  No product items. This contract is service-only — just set the
                  service fee and billing frequency above.
                </p>
              )}

              {form.items.map((item, index) => (
                <div
                  key={item.id || `new-${index}`}
                  className="rounded-xl border bg-muted/10 p-4 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Item #{index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeProductRow(index)}
                      disabled={saving}
                      title="Remove item"
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Product Selection */}
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label className="text-xs">Product *</Label>
                      <SearchableSelect
                        value={item.productId}
                        onValueChange={(val) =>
                          updateProductRow(index, "productId", val)
                        }
                        options={productOptions}
                        placeholder="Select product"
                        searchPlaceholder="Search products..."
                        disabled={saving}
                      />
                    </div>

                    {/* Entitled Qty */}
                    <div className="space-y-1">
                      <Label className="text-xs">Entitled Quantity *</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.entitledQty || ""}
                        disabled={saving}
                        onChange={(e) =>
                          updateProductRow(
                            index,
                            "entitledQty",
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        placeholder="1"
                      />
                    </div>

                    {/* Renewal Frequency */}
                    <div className="space-y-1">
                      <Label className="text-xs">Renewal Frequency</Label>
                      <Select
                        value={item.frequency}
                        onValueChange={(val) =>
                          updateProductRow(index, "frequency", val)
                        }
                        disabled={saving}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCY_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Item Status</Label>
                      <Select
                        value={item.status}
                        onValueChange={(val) =>
                          updateProductRow(index, "status", val as "Active" | "Inactive")
                        }
                        disabled={saving}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Update Contract" : "Create Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        description={`Delete contract for "${deleteTarget?.companyName}"? This will also delete all associated product items and cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

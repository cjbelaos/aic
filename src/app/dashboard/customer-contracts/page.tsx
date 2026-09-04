//customer-contracts page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  monthlyServiceFee: string;
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
  monthlyServiceFee: "",
  items: [],
};

/* ── Grouped Customer Data Structure for Display ────────── */
interface GroupedCustomerContract extends ContractWithItems {
  companyName: string; // Denormalized for display
}

/* ── Page ───────────────────────────────────────────────── */
export default function CustomerContractsPage() {
  const [data, setData] = useState<ContractWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupedCustomerContract | null>(
    null,
  );
  const [form, setForm] = useState<CustomerContractFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] =
    useState<GroupedCustomerContract | null>(null);

  // Reference data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);

  // Fast Product Lookup Map O(1)
  const productMap = useMemo(() => {
    const map = new Map<string, string>();
    productsList.forEach((p) => {
      map.set(p.code, p.name);
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

  // Group contracts by Company Name for display
  const groupedContracts = useMemo<GroupedCustomerContract[]>(() => {
    const map = new Map<string, ContractWithItems>();

    data.forEach((contract) => {
      const companyName = companyMap.get(contract.companyId) || "Unknown";
      if (map.has(contract.companyId)) {
        const existingContract = map.get(contract.companyId)!;
        map.set(contract.companyId, {
          ...existingContract,
          items: [...existingContract.items, ...contract.items],
        });
      } else {
        map.set(contract.companyId, { ...contract, companyName });
      }
    });

    return Array.from(map.values()).map((contract) => ({
      ...contract,
      companyName: companyMap.get(contract.companyId) || "Unknown",
    }));
  }, [data, companyMap]);

  /* ── Columns Definition ───────────────────────────────── */
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
          <span className="font-semibold">{row.original.companyName}</span>
        ),
      },
      {
        accessorKey: "agreementType",
        header: "Agreement Type",
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-[10px]">
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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          const variant = status === "Active" ? "default" : "destructive";
          return <Badge variant={variant}>{status}</Badge>;
        },
      },
      {
        accessorKey: "monthlyServiceFee",
        id: "monthlyServiceFee",
        header: "Monthly Service Fee",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-foreground">
            {formatCurrency(row.original.monthlyServiceFee)}
          </span>
        ),
      },
      {
        id: "products",
        header: "Contracted Products",
        cell: ({ row }) => {
          if (row.original.items.length === 0) {
            return (
              <span className="text-xs italic text-muted-foreground">
                No items — service-only
              </span>
            );
          }
          return (
            <div className="flex flex-col gap-2 py-1">
              {row.original.items.map((item) => {
                const productName =
                  productMap.get(item.productCode) || item.productCode;

                return (
                  <div
                    key={item.id || item.productCode}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {productName}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {item.productCode}
                      </span>
                    </div>
                    <Badge variant="outline" className="ml-2 font-mono">
                      Qty: {item.entitledQty}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {item.frequency || "Monthly"}
                    </Badge>
                    {item.status === "Inactive" ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Inactive
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          );
        },
      },
      {
        id: "totalProducts",
        header: "Total Products",
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
    [productMap],
  );

  const loadContracts = useCallback(async () => {
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
        setLoading(false);
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    if (companies.length === 0) return;
    loadContracts();
  }, [companies, loadContracts]);

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
        value: p.code,
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
      monthlyServiceFee:
        row.monthlyServiceFee != null ? String(row.monthlyServiceFee) : "",
      items: row.items.map((item) => ({
        id: item.id,
        productId: item.productCode,
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

  const removeProductRow = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateProductRow = (
    index: number,
    field: keyof ContractFormItem,
    value: any,
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
      setError("Provide at least one product item or a monthly service fee.");
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
            itemsToDelete.map((item) => contractItemService.delete(item.id)),
          );
        }

        // Update items that exist in both (sequential)
        for (const formItem of itemsToUpdate) {
          const existingItem = existingItems.find(
            (e) => e.id === formItem.id,
          );
          if (existingItem) {
            // Only update if there are changes
            if (
              existingItem.productCode !== formItem.productId ||
              existingItem.entitledQty !== formItem.entitledQty ||
              existingItem.frequency !== formItem.frequency ||
              existingItem.status !== formItem.status
            ) {
              await contractItemService.update({
                id: formItem.id!,
                contractId,
                productCode: formItem.productId,
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
            productCode: item.productId,
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
        });

        if (!newContract) throw new Error("Failed to create contract.");
        contractId = newContract.id;

        // Create all items for new contract (sequential to avoid race conditions)
        for (const item of form.items) {
          await contractItemService.create({
            contractId,
            productCode: item.productId,
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
    } catch (err: any) {
      console.error("Save error:", err);
      const apiErrorMsg =
        err?.response?.data?.error ||
        err?.message ||
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
    } catch (err: any) {
      console.error("Delete error:", err);
      const apiErrorMsg =
        err?.response?.data?.error ||
        err?.message ||
        "Failed to delete contract.";
      toast.error(apiErrorMsg);
    } finally {
      setDeleteTarget(null);
      setSaving(false);
    }
  };

  return (
    <>
      <EntityTable
        title="Customer Contract Entitlements"
        columns={columns}
        data={groupedContracts}
        loading={loading}
        onCreateNew={openCreate}
        onEdit={openEdit}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(v) => {
          if (!saving) setModalOpen(v);
        }}
      >
        <DialogContent
          className="sm:max-w-6xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Customer Contract" : "Add Customer Contract"}
            </DialogTitle>
            <DialogDescription>
              Complete the contract details and add product entitlements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Contract Header Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Customer Name */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-customer">Customer *</Label>
                <SearchableSelect
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

              {/* Start Date - Updated to use DatePicker */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-start-date">Start Date *</Label>
                <DatePicker
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
                  value={form.endDate}
                  onChange={(date) => setForm((f) => ({ ...f, endDate: date }))}
                  disabled={form.startDate ? { before: form.startDate } : undefined}
                  startMonth={todayStart}
                  endMonth={endDateMax}
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

              {/* Monthly Service Fee */}
              <div className="space-y-1.5">
                <Label htmlFor="cc-monthly-fee">Monthly Service Fee (₱)</Label>
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
            </div>

            {/* Product Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Product Items</Label>
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
                  monthly service fee above.
                </p>
              )}

              {form.items.map((item, index) => (
                <div
                  key={item.id || `new-${index}`}
                  className="p-3 border rounded-lg bg-card/50 space-y-3 relative"
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
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Product Selection */}
                    <div className="space-y-1 sm:col-span-2">
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
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Item Status</Label>
                      <Select
                        value={item.status}
                        onValueChange={(val) =>
                          updateProductRow(index, "status", val)
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

          <DialogFooter>
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

"use client";

import { useEffect, useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityTable } from "@/components/ui/entity-table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Services
import customerPriceService from "@/lib/services/customer-price.service";
import customerService from "@/lib/services/customer.service";
import productService from "@/lib/services/product.service";

// Types
import {
  CustomerPrice,
  CreateCustomerPricePayload,
  UpdateCustomerPricePayload,
} from "@/types/customer-price";
import { Customer } from "@/types/customer";
import { Product } from "@/types/product";

/* ── Form state ─────────────────────────────────────────── */
interface CustomerPriceFormState {
  customerName: string;
  productCode: string;
  pricePerUnit: number;
}

const EMPTY_FORM: CustomerPriceFormState = {
  customerName: "",
  productCode: "",
  pricePerUnit: 0,
};

/* ── Helper: build CreateCustomerPricePayload from form state ── */
function buildCreatePayload(
  form: CustomerPriceFormState,
): CreateCustomerPricePayload {
  return {
    customerName: form.customerName,
    productCode: form.productCode,
    pricePerUnit: form.pricePerUnit,
  };
}

/* ── Columns ────────────────────────────────────────────── */
const columns: ColumnDef<CustomerPrice>[] = [
  {
    accessorKey: "customerName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Customer Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "productCode",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Product Code <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "pricePerUnit",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Custom Price/Unit <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => {
      const value = row.original.pricePerUnit;
      return (
        <span className="text-blue-600">
          {value.toLocaleString("en-PH", {
            style: "currency",
            currency: "PHP",
            minimumFractionDigits: 2,
          })}
        </span>
      );
    },
  },
];

/* ── Page ───────────────────────────────────────────────── */
export default function CustomerPricesPage() {
  const [data, setData] = useState<CustomerPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerPrice | null>(null);
  const [form, setForm] = useState<CustomerPriceFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CustomerPrice | null>(null);

  // Reference data for validation / dropdowns
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const loadPrices = async () => {
    try {
      const prices = await customerPriceService.getAll();
      setData(prices);
    } catch (err) {
      console.error("Error loading customer prices:", err);
      toast.error("Failed to load customer prices.");
    }
  };

  useEffect(() => {
    loadPrices().finally(() => setLoading(false));

    customerService
      .getAll()
      .then((r) => {
        setCustomers(Array.isArray(r) ? r : []);
      })
      .catch(console.error);

    productService
      .getAll()
      .then((r) => {
        setProducts(Array.isArray(r) ? r : []);
      })
      .catch(console.error);
  }, []);

  // Build dropdown options from reference data
  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.customerName,
        label: c.customerName,
      })),
    [customers],
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.code,
        label: `${p.code} - ${p.name || p.description || ""}`,
      })),
    [products],
  );

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: CustomerPrice) => {
    setEditTarget(row);
    setForm({
      customerName: row.customerName,
      productCode: row.productCode,
      pricePerUnit: row.pricePerUnit,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    // Client-side validation
    if (!form.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!form.productCode.trim()) {
      setError("Product code is required.");
      return;
    }
    if (form.pricePerUnit <= 0) {
      setError("Custom Price/Unit must be a positive number greater than 0.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        const updatePayload: UpdateCustomerPricePayload = {
          id: editTarget.id,
          ...buildCreatePayload(form),
        };
        await customerPriceService.update(updatePayload);
        await loadPrices();
        toast.success("Customer price updated successfully.");
      } else {
        await customerPriceService.create(buildCreatePayload(form));
        await loadPrices();
        toast.success("Customer price created successfully.");
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error("Save error:", err);
      const errMsg =
        err.response?.data?.error ||
        err.message ||
        "Server error. Please try again.";
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await customerPriceService.delete(deleteTarget.id);
      await loadPrices();
      toast.success(
        `Price for "${deleteTarget.customerName}" / "${deleteTarget.productCode}" deleted.`,
      );
    } catch (err: any) {
      console.error("Delete error:", err);
      const errMsg =
        err.response?.data?.error || "Failed to delete customer price.";
      toast.error(errMsg);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <EntityTable
        title="Customer Prices"
        columns={columns}
        data={data}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Customer Price" : "Create Customer Price"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Customer Name */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-customer">Customer Name *</Label>
              <SearchableSelect
                value={form.customerName}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, customerName: v }))
                }
                options={customerOptions}
                placeholder="Select customer"
                searchPlaceholder="Search customers..."
                disabled={saving}
              />
            </div>

            {/* Product Code */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-product">Product Code *</Label>
              <SearchableSelect
                value={form.productCode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, productCode: v }))
                }
                options={productOptions}
                placeholder="Select product"
                searchPlaceholder="Search products..."
                disabled={saving}
              />
            </div>

            {/* Custom Price/Unit */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-price">Custom Price/Unit *</Label>
              <Input
                id="cp-price"
                type="number"
                min={0.01}
                step="0.01"
                value={form.pricePerUnit || ""}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    pricePerUnit: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="0.00"
              />
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
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        description={`Delete custom price for "${deleteTarget?.customerName}" / "${deleteTarget?.productCode}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

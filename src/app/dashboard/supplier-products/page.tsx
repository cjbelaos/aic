"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityTable } from "@/components/ui/entity-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import companyService from "@/lib/services/company.service";
import productService from "@/lib/services/product.service";
import supplierProductService from "@/lib/services/supplier-product-v2.service";
import type { Company } from "@/types/company";
import type { Product } from "@/types/product";
import type { CreateSupplierProductV2Payload, SupplierProductV2 } from "@/types/supplier-product";

interface SupplierProductForm {
  productId: string;
  supplierId: string;
  supplierProductCode: string;
  supplierProductName: string;
  supplierDescription: string;
  costPerUnit: number;
  isPreferredSupplier: boolean;
  status: "active" | "inactive";
}

const EMPTY_FORM: SupplierProductForm = {
  productId: "",
  supplierId: "",
  supplierProductCode: "",
  supplierProductName: "",
  supplierDescription: "",
  costPerUnit: 0,
  isPreferredSupplier: false,
  status: "active",
};

const currency = (value: number) => value.toLocaleString("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export default function SupplierProductsPage() {
  const searchParams = useSearchParams();
  const requestedProductId = searchParams.get("productId") ?? "";
  const [rows, setRows] = useState<SupplierProductV2[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierProductV2 | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierProductV2 | null>(null);
  const [form, setForm] = useState<SupplierProductForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const [supplierProducts, canonicalProducts, companies] = await Promise.all([
        supplierProductService.getAll(),
        productService.getAll(),
        companyService.getAll(),
      ]);
      setRows(supplierProducts);
      setProducts(canonicalProducts.filter((product) => product.sourceVersion !== "v1"));
      setSuppliers(companies.filter((company) => company.status === "active" && (company.companyType === "Supplier" || company.companyType === "Both")));
    } catch (error) {
      console.error("Failed to load supplier products:", error);
      toast.error("Failed to load supplier products.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const productById = useMemo(() => new Map(products.map((product) => [product.productId ?? product.id, product])), [products]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.companyId, supplier])), [suppliers]);
  const productOptions = useMemo(() => products.map((product) => ({ value: product.productId ?? product.id, label: `${product.code} - ${product.name}` })), [products]);
  const supplierOptions = useMemo(() => suppliers.map((supplier) => ({ value: supplier.companyId, label: supplier.companyName })), [suppliers]);

  const visibleRows = useMemo(
    () => requestedProductId ? rows.filter((row) => row.productId === requestedProductId) : rows,
    [requestedProductId, rows],
  );

  const columns = useMemo<ColumnDef<SupplierProductV2>[]>(() => [
    {
      accessorKey: "supplierProductName",
      header: ({ column }) => <Button variant="ghost" className="px-0 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Supplier Product <ArrowUpDown className="ml-1 h-3.5 w-3.5" /></Button>,
      cell: ({ row }) => <div><p className="font-medium">{row.original.supplierProductName}</p>{row.original.supplierProductCode && <p className="text-xs text-muted-foreground">{row.original.supplierProductCode}</p>}</div>,
    },
    {
      id: "product",
      accessorFn: (row) => productById.get(row.productId)?.name ?? row.productId,
      header: "Canonical Product",
      cell: ({ row }) => {
        const product = productById.get(row.original.productId);
        return product ? <div><p>{product.name}</p><p className="text-xs text-muted-foreground">{product.code}</p></div> : <span className="text-muted-foreground">Unknown product</span>;
      },
    },
    {
      id: "supplier",
      accessorFn: (row) => supplierById.get(row.supplierId)?.companyName ?? row.supplierId,
      header: "Supplier",
      cell: ({ row }) => supplierById.get(row.original.supplierId)?.companyName ?? <span className="text-muted-foreground">{row.original.supplierId}</span>,
    },
    { accessorKey: "costPerUnit", header: "Cost / Unit", cell: ({ row }) => currency(row.original.costPerUnit) },
    { accessorKey: "isPreferredSupplier", header: "Preferred", cell: ({ row }) => row.original.isPreferredSupplier ? <Badge variant="secondary">Preferred</Badge> : <span className="text-muted-foreground">-</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "active" ? "default" : "secondary"}>{row.original.status}</Badge> },
  ], [productById, supplierById]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, productId: requestedProductId });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (row: SupplierProductV2) => {
    setEditTarget(row);
    setForm({
      productId: row.productId,
      supplierId: row.supplierId,
      supplierProductCode: row.supplierProductCode ?? "",
      supplierProductName: row.supplierProductName,
      supplierDescription: row.supplierDescription ?? "",
      costPerUnit: row.costPerUnit,
      isPreferredSupplier: row.isPreferredSupplier,
      status: row.status,
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.productId || !form.supplierId || !form.supplierProductName.trim()) {
      setFormError("Canonical product, supplier, and supplier product name are required.");
      return;
    }
    if (form.costPerUnit < 0) {
      setFormError("Cost per unit cannot be negative.");
      return;
    }
    setSaving(true);
    setFormError("");
    const payload: CreateSupplierProductV2Payload = {
      productId: form.productId,
      supplierId: form.supplierId,
      supplierProductCode: form.supplierProductCode.trim() || undefined,
      supplierProductName: form.supplierProductName.trim(),
      supplierDescription: form.supplierDescription.trim() || undefined,
      costPerUnit: form.costPerUnit,
      isPreferredSupplier: form.isPreferredSupplier,
      status: form.status,
    };
    try {
      if (editTarget) {
        await supplierProductService.update({ supplierProductId: editTarget.supplierProductId, ...payload });
        toast.success("Supplier product updated.");
      } else {
        await supplierProductService.create(payload);
        toast.success("Supplier product added.");
      }
      await load();
      setModalOpen(false);
    } catch (error) {
      console.error("Failed to save supplier product:", error);
      setFormError(error instanceof Error ? error.message : "Failed to save supplier product.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deleteTarget) return;
    try {
      await supplierProductService.deactivate(deleteTarget.supplierProductId);
      await load();
      toast.success("Supplier product deactivated.");
    } catch (error) {
      console.error("Failed to deactivate supplier product:", error);
      toast.error("Failed to deactivate supplier product.");
    } finally {
      setDeleteTarget(null);
    }
  };

  return <>
    <EntityTable title={requestedProductId ? "Supplier Products for Product" : "Supplier Products"} columns={columns} data={visibleRows} loading={loading} onCreateNew={openCreate} onEdit={openEdit} onDelete={setDeleteTarget} />

    <Dialog open={modalOpen} onOpenChange={(open) => { if (!saving) setModalOpen(open); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editTarget ? "Edit Supplier Product" : "Add Supplier Product"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="space-y-1.5"><Label>Canonical Product *</Label><SearchableSelect value={form.productId} onValueChange={(productId) => setForm((current) => ({ ...current, productId }))} options={productOptions} placeholder="Select product" searchPlaceholder="Search products..." disabled={saving || !!editTarget} /></div>
          <div className="space-y-1.5"><Label>Supplier *</Label><SearchableSelect value={form.supplierId} onValueChange={(supplierId) => setForm((current) => ({ ...current, supplierId }))} options={supplierOptions} placeholder="Select supplier" searchPlaceholder="Search suppliers..." disabled={saving} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="supplier-product-name">Supplier Product Name *</Label><Input id="supplier-product-name" value={form.supplierProductName} onChange={(event) => setForm((current) => ({ ...current, supplierProductName: event.target.value }))} disabled={saving} /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-product-code">Supplier Product Code</Label><Input id="supplier-product-code" value={form.supplierProductCode} onChange={(event) => setForm((current) => ({ ...current, supplierProductCode: event.target.value }))} disabled={saving} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="supplier-product-description">Supplier Description</Label><Input id="supplier-product-description" value={form.supplierDescription} onChange={(event) => setForm((current) => ({ ...current, supplierDescription: event.target.value }))} disabled={saving} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="supplier-product-cost">Cost / Unit *</Label><Input id="supplier-product-cost" type="number" min="0" step="0.01" value={form.costPerUnit} onChange={(event) => setForm((current) => ({ ...current, costPerUnit: Number(event.target.value) || 0 }))} disabled={saving} /></div>
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-3"><Switch id="supplier-product-preferred" checked={form.isPreferredSupplier} onCheckedChange={(isPreferredSupplier) => setForm((current) => ({ ...current, isPreferredSupplier }))} disabled={saving} /><Label htmlFor="supplier-product-preferred">Preferred supplier</Label></div>
              <div className="flex items-center gap-3"><Switch id="supplier-product-active" checked={form.status === "active"} onCheckedChange={(isActive) => setForm((current) => ({ ...current, status: isActive ? "active" : "inactive" }))} disabled={saving} /><Label htmlFor="supplier-product-active">Active</Label></div>
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button><Button disabled={saving} onClick={handleSave}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmDeleteDialog open={!!deleteTarget} title="Deactivate Supplier Product" description={`Deactivate \"${deleteTarget?.supplierProductName ?? ""}\"? Existing documents will remain unchanged.`} onConfirm={handleDeactivate} onClose={() => setDeleteTarget(null)} />
  </>;
}

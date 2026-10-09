"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Download, Loader2 } from "lucide-react";
import { matchesDocumentSearch } from "@/lib/document-register";
import { exportSupplierProducts } from "@/lib/supplierProductExport";
import axios from "axios";
import { saveSupplierProductWithProduct } from "@/lib/supplier-product-workflow";
import type { ProductCategoryRecord, ProductUnitRecord } from "@/types/product-reference";
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
import supplierProductService from "@/lib/services/supplier-product.service";
import type { Company } from "@/types/company";
import type { Product } from "@/types/product";
import type { CreateSupplierProductPayload, SupplierProduct } from "@/types/supplier-product";

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

const EMPTY_PRODUCT = { code: "", name: "", categoryId: "", unitId: "", sellingPrice: "" };
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const currency = (value: number) => value.toLocaleString("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export default function SupplierProductsPage() {
  const searchParams = useSearchParams();
  const requestedProductId = searchParams.get("productId") ?? "";
  const [rows, setRows] = useState<SupplierProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierProduct | null>(null);
  const [createNewProduct, setCreateNewProduct] = useState(false);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);
  const [createdProductId, setCreatedProductId] = useState("");
  const [references, setReferences] = useState<{ categories: ProductCategoryRecord[]; units: ProductUnitRecord[] }>({ categories: [], units: [] });
  const [form, setForm] = useState<SupplierProductForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const [supplierProducts, canonicalProducts, companies, productReferences] = await Promise.all([
        supplierProductService.getAll(),
        productService.getAll(),
        companyService.getAll(),
        axios.get<{ categories: ProductCategoryRecord[]; units: ProductUnitRecord[] }>("/api/product-references"),
      ]);
      setReferences(productReferences.data);
      setRows(supplierProducts);
      setProducts(canonicalProducts);
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
    () => rows.filter((row) => (!requestedProductId || row.productId === requestedProductId) && matchesDocumentSearch(search, [row.supplierProductName, row.supplierProductCode, row.supplierDescription, productById.get(row.productId)?.name ?? row.productId, productById.get(row.productId)?.code, supplierById.get(row.supplierId)?.companyName ?? row.supplierId, row.costPerUnit, row.status])),
    [requestedProductId, rows, search, productById, supplierById],
  );

  const handleExport = async () => {
    if (loading || exporting || !visibleRows.length) return;
    setExporting(true);
    try {
      await exportSupplierProducts(visibleRows.map((row) => ({
        ...row,
        canonicalProductName: productById.get(row.productId)?.name ?? row.productId,
        canonicalProductCode: productById.get(row.productId)?.code ?? "",
        supplierName: supplierById.get(row.supplierId)?.companyName ?? row.supplierId,
      })));
      toast.success(`Exported ${visibleRows.length} supplier product(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Supplier product export failed.");
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<SupplierProduct>[]>(() => [
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

  const similarProducts = products.filter((product) => {
    const name = normalize(newProduct.name);
    const code = normalize(newProduct.code);
    return (code && normalize(product.code) === code) || (name.length >= 3 && normalize(product.name).includes(name));
  }).slice(0, 5);
  const selectProduct = (productId: string) => {
    const product = productById.get(productId);
    setForm((current) => ({ ...current, productId, supplierProductName: current.supplierProductName || product?.name || "" }));
    setCreateNewProduct(false);
    setFormError("");
  };

  const openCreate = () => {
    setCreateNewProduct(false);
    setNewProduct(EMPTY_PRODUCT);
    setCreatedProductId("");
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, productId: requestedProductId });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (row: SupplierProduct) => {
    setCreateNewProduct(false);
    setCreatedProductId("");
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
    if ((!createNewProduct && !form.productId) || !form.supplierId || !(form.supplierProductName.trim() || (createNewProduct && newProduct.name.trim()))) {
      setFormError("Product, supplier, and supplier product name are required.");
      return;
    }
    const category = references.categories.find((item) => item.productCategoryId === newProduct.categoryId && item.status === "active");
    const unit = references.units.find((item) => item.unitId === newProduct.unitId && item.status === "active");
    if (createNewProduct && (!newProduct.name.trim() || !category || !unit)) {
      setFormError("New product name, active category, and unit are required.");
      return;
    }
    if (createNewProduct && newProduct.sellingPrice !== "" && (!Number.isFinite(Number(newProduct.sellingPrice)) || Number(newProduct.sellingPrice) < 0)) {
      setFormError("Default selling price must be a valid non-negative amount.");
      return;
    }
    if (createNewProduct && products.some((product) =>
      (newProduct.code.trim() && normalize(product.code) === normalize(newProduct.code)) ||
      (normalize(product.name) === normalize(newProduct.name) && product.category.id === newProduct.categoryId && product.unit.id === newProduct.unitId))) {
      setFormError("This product already exists. Choose Select existing product to link it to this supplier.");
      return;
    }
    if (!Number.isFinite(form.costPerUnit) || form.costPerUnit < 0) {
      setFormError("Cost per unit cannot be negative.");
      return;
    }
    setSaving(true);
    setFormError("");
    const payload: CreateSupplierProductPayload = {
      productId: form.productId,
      supplierId: form.supplierId,
      supplierProductCode: form.supplierProductCode.trim() || undefined,
      supplierProductName: form.supplierProductName.trim() || newProduct.name.trim(),
      supplierDescription: form.supplierDescription.trim() || undefined,
      costPerUnit: form.costPerUnit,
      isPreferredSupplier: form.isPreferredSupplier,
      status: form.status,
    };
    let productCreated = !!createdProductId;
    try {
      if (editTarget) {
        await supplierProductService.update({ supplierProductId: editTarget.supplierProductId, ...payload });
        toast.success("Supplier product updated.");
      } else {
        const supplier = suppliers.find((item) => item.companyId === form.supplierId);
        if (!supplier) throw new Error("Select an available supplier.");
        await saveSupplierProductWithProduct({
          productId: payload.productId,
          createProduct: createNewProduct && category && unit ? () => productService.create({
            code: newProduct.code.trim(), name: newProduct.name.trim(),
            category: { id: category.productCategoryId, code: category.categoryCode, name: category.categoryName },
            unit: { id: unit.unitId, code: unit.unitCode, name: unit.unitName },
            description: "", costPerUnit: 0, pricePerUnit: Number(newProduct.sellingPrice) || 0, supplier,
          }) : undefined,
          rememberProduct: (product) => {
            const productId = product.productId ?? product.id;
            productCreated = true;
            setCreatedProductId(productId);
            setProducts((current) => [...current, product]);
            setForm((current) => ({ ...current, productId, supplierProductName: payload.supplierProductName }));
            setCreateNewProduct(false);
          },
          saveSupplierProduct: (productId) => supplierProductService.create({ ...payload, productId }),
        });
        toast.success(productCreated ? "Product and supplier product saved." : "Supplier product added.");
      }
      await load();
      setModalOpen(false);
    } catch (error) {
      console.error("Failed to save supplier product:", error);
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to save supplier product.";
      setFormError(productCreated ? `Product already created. Supplier link was not saved: ${message} Retry Save to complete the link.` : message);
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
    <EntityTable title={requestedProductId ? "Supplier Products for Product" : "Supplier Products"} columns={columns} data={visibleRows} searchValue={search} onSearchChange={setSearch} toolbarFilters={<Button type="button" variant="outline" size="sm" onClick={() => void handleExport()} disabled={loading || exporting || !visibleRows.length} title="Export all matching supplier products"><Download className="mr-2 h-4 w-4" />{exporting ? "Exporting..." : "Export Excel"}</Button>} loading={loading} onCreateNew={openCreate} onEdit={openEdit} onDelete={setDeleteTarget} mobileLayout={{ primary: ["supplierProductName", "product", "supplier"], labels: { supplierProductName: "Supplier product", product: "Product", supplier: "Supplier", costPerUnit: "Cost / unit", isPreferredSupplier: "Preferred", status: "Status", actions: "Actions" } }} />

    <Dialog open={modalOpen} onOpenChange={(open) => { if (!saving) setModalOpen(open); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editTarget ? "Edit Supplier Product" : "Add Supplier Product"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          {!editTarget && !createdProductId && <div className="flex flex-wrap gap-2">
            <Button variant={createNewProduct ? "outline" : "default"} disabled={saving} onClick={() => setCreateNewProduct(false)}>Select existing product</Button>
            <Button variant={createNewProduct ? "default" : "outline"} disabled={saving} onClick={() => { setCreateNewProduct(true); setFormError(""); }}>Create new product</Button>
          </div>}
          {createNewProduct ? <section className="space-y-3 rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Save once to create this product and link it to the supplier below.</p>
            <div className="space-y-1.5"><Label htmlFor="new-product-name">Product Name *</Label><Input id="new-product-name" value={newProduct.name} onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))} disabled={saving} /></div>
            <div className="space-y-1.5"><Label htmlFor="new-product-code">Product Code (optional)</Label><Input id="new-product-code" placeholder="Automatically generated if blank" value={newProduct.code} onChange={(event) => setNewProduct((current) => ({ ...current, code: event.target.value }))} disabled={saving} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Category *</Label><SearchableSelect value={newProduct.categoryId} options={references.categories.filter((item) => item.status === "active").map((item) => ({ value: item.productCategoryId, label: item.categoryName }))} onValueChange={(categoryId) => setNewProduct((current) => ({ ...current, categoryId }))} placeholder="Select category" disabled={saving} /></div>
              <div className="space-y-1.5"><Label>Unit *</Label><SearchableSelect value={newProduct.unitId} options={references.units.filter((item) => item.status === "active").map((item) => ({ value: item.unitId, label: item.unitName }))} onValueChange={(unitId) => setNewProduct((current) => ({ ...current, unitId }))} placeholder="Select unit" disabled={saving} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="new-product-price">Default Selling Price (optional)</Label><Input id="new-product-price" type="number" min="0" step="0.01" value={newProduct.sellingPrice} onChange={(event) => setNewProduct((current) => ({ ...current, sellingPrice: event.target.value }))} disabled={saving} /></div>
            {similarProducts.length > 0 && <div className="space-y-2 rounded-md bg-muted p-3">
              <p className="text-sm font-medium">Matching products - select one to reuse it</p>
              {similarProducts.map((product) => <Button key={product.id} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" disabled={saving} onClick={() => selectProduct(product.productId ?? product.id)}>{product.code} - {product.name} ({product.unit.name})</Button>)}
            </div>}
          </section> : <div className="space-y-1.5"><Label>Product *</Label><SearchableSelect value={form.productId} onValueChange={selectProduct} options={productOptions} placeholder="Select product" searchPlaceholder="Search products..." disabled={saving || !!editTarget || !!createdProductId} /></div>}
          {createdProductId && <p className="text-sm text-muted-foreground">The product is saved. Save again to complete its supplier link.</p>}
          <div className="space-y-1.5"><Label>Supplier *</Label><SearchableSelect value={form.supplierId} onValueChange={(supplierId) => setForm((current) => ({ ...current, supplierId }))} options={supplierOptions} placeholder="Select supplier" searchPlaceholder="Search suppliers..." disabled={saving} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="supplier-product-name">Supplier Product Name *</Label><Input id="supplier-product-name" placeholder={createNewProduct ? "Uses product name if blank" : undefined} value={form.supplierProductName} onChange={(event) => setForm((current) => ({ ...current, supplierProductName: event.target.value }))} disabled={saving} /></div>
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

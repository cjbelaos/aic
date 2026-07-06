"use client";

import { useEffect, useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2 } from "lucide-react";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Services
import productService from "@/lib/services/product.service";
import customerService from "@/lib/services/customer.service";
import productUnitService from "@/lib/services/product-unit.service";
import supplierService from "@/lib/services/supplier.service";

// Types
import {
  Product,
  CreateProductPayload,
  UpdateProductPayload,
  ProductStatus,
} from "@/types/product";
import { ProductCategory } from "@/types/product-category";
import { Supplier } from "@/types/supplier";
import { Customer } from "@/types/customer";
import { ProductUnit } from "@/types/product-unit";

/* ── Constants ─────────────────────────────────────────── */
const PRODUCT_CATEGORIES: string[] = [
  "Raw Materials",
  "Finished Goods",
  "Packaging",
  "Supplies",
  "Equipment",
  "Other",
];

const PRODUCT_STATUSES: ProductStatus[] = [
  "In Stock",
  "Out of Stock",
  "Low stock",
];

/* ── Form state (using IDs for relations, separate from CreateProductPayload) ── */
interface ProductFormState {
  productCode: string;
  categoryId: string;
  customerId: string;
  productName: string;
  description: string;
  productUnitId: string;
  costPerUnit: number;
  pricePerUnit: number | undefined;
  supplierId: string;
  status: ProductStatus;
  minStock: number;
  begStock: number;
  qtyIn: number;
  actualStock: number;
  reservedUnits: number;
  qtyOut: number;
  inventoryFlag: string;
}

const EMPTY_FORM: ProductFormState = {
  productCode: "",
  categoryId: "",
  customerId: "",
  productName: "",
  description: "",
  productUnitId: "",
  costPerUnit: 0,
  pricePerUnit: undefined,
  supplierId: "",
  status: "In Stock",
  minStock: 0,
  begStock: 0,
  qtyIn: 0,
  actualStock: 0,
  reservedUnits: 0,
  qtyOut: 0,
  inventoryFlag: "",
};

/* ── Excel export ─────────────────────────────────────────── */
function exportToExcel(rows: Product[]) {
  const worksheetData =
    !rows || rows.length === 0
      ? [
          {
            "Product Code": "",
            "Product Category": "",
            "Customer Name": "",
            "Product Name": "",
            Description: "",
            Unit: "",
            "Cost Per Unit": "",
            "Price Per Unit": "",
            "Supplier Name": "",
            Status: "",
            "Min Stock": "",
            "Beg Stock": "",
            "Quantity In": "",
            "Actual Stock": "",
            "Reserved Units": "",
            "Quantity Out": "",
            "Inventory Flag": "",
          },
        ]
      : rows.map((r) => {
          const cName = r.customer?.customerName;
          const compName = r.customer?.companyName;
          const displayCustomerName =
            cName && cName.trim() !== "" ? cName : compName || "";
          return {
            "Product Code": r.productCode,
            "Product Category": r.category?.name || "",
            "Customer Name": displayCustomerName,
            "Product Name": r.productName,
            Description: r.description || "",
            Unit: r.unit?.name || "",
            "Cost Per Unit": r.costPerUnit,
            "Price Per Unit": r.pricePerUnit ?? "",
            "Supplier Name": r.supplier?.supplierName || "",
            Status: r.status,
            "Min Stock": r.minStock,
            "Beg Stock": r.begStock,
            "Quantity In": r.qtyIn,
            "Actual Stock": r.actualStock,
            "Reserved Units": r.reservedUnits,
            "Quantity Out": r.qtyOut,
            "Inventory Flag": r.inventoryFlag,
          };
        });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");
  worksheet.addRow(Object.keys(worksheetData[0]));
  worksheetData.forEach((row) => {
    worksheet.addRow(Object.values(row));
  });
  workbook.xlsx.writeFile("products.xlsx");
}

/* ── columns ────────────────────────────────────────────── */
const columns: ColumnDef<Product>[] = [
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
    id: "categoryName",
    accessorFn: (row) => row.category?.name || "",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Product Category <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    id: "customerName",
    accessorFn: (row) => {
      const name = row.customer?.customerName;
      const company = row.customer?.companyName;
      return name && name.trim() !== "" ? name : company || "";
    },
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
    accessorKey: "productName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Product Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-blue-600 font-medium">
        {row.original.productName}
      </span>
    ),
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Description <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    id: "unitName",
    accessorFn: (row) => row.unit?.name || "",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Unit <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "costPerUnit",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Cost/Unit <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-blue-600">{row.original.costPerUnit}</span>
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
        Price/Unit <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => row.original.pricePerUnit ?? "—",
  },
  {
    id: "supplierName",
    accessorFn: (row) => row.supplier?.supplierName || "",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Supplier Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => row.original.status ?? "—",
  },
  {
    accessorKey: "minStock",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Min Stock <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => row.original.minStock ?? "—",
  },
  {
    accessorKey: "begStock",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Beg Stock <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => row.original.begStock ?? "—",
  },
  {
    accessorKey: "qtyIn",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Qty In <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => row.original.qtyIn ?? "—",
  },
  {
    accessorKey: "actualStock",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Actual Stock <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "reservedUnits",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Reserved Units <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "qtyOut",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Qty Out <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "inventoryFlag",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Inventory Flag <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => row.original.inventoryFlag ?? "—",
  },
];

/* ── Helper: build CreateProductPayload from form state + lookup maps ── */
function buildCreatePayload(
  form: ProductFormState,
  lookup: {
    categories: ProductCategory[];
    customers: Customer[];
    units: ProductUnit[];
    suppliers: Supplier[];
  },
): CreateProductPayload {
  const cat = lookup.categories.find((c) => c.id === form.categoryId);
  const cust = lookup.customers.find((c) => c.id === form.customerId);
  const u = lookup.units.find((unit) => unit.id === form.productUnitId);
  const supp = lookup.suppliers.find((s) => s.id === form.supplierId);

  return {
    clientCode: "",
    productCode: form.productCode,
    category: cat || { id: form.categoryId, name: form.categoryId },
    customer: cust || {
      id: form.customerId,
      customerName: "",
      companyName: "",
      contactPerson: "",
      contactNumber: "",
      email: "",
      tin: "",
      address: "",
    },
    productName: form.productName,
    description: form.description,
    unit: u || { id: form.productUnitId, name: form.productUnitId },
    costPerUnit: form.costPerUnit,
    pricePerUnit: form.pricePerUnit ?? 0,
    supplier: supp || {
      id: form.supplierId,
      supplierName: "",
      tin: "",
      address: "",
      status: "",
    },
    status: form.status,
    minStock: form.minStock,
    begStock: form.begStock,
    qtyIn: form.qtyIn,
    actualStock: form.actualStock,
    reservedUnits: form.reservedUnits,
    qtyOut: form.qtyOut,
    inventoryFlag: form.inventoryFlag,
  };
}

/* ── page ───────────────────────────────────────────────── */
export default function ProductsPage() {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>(
    [],
  );

  const loadProducts = async () => {
    try {
      const products = await productService.getAll();
      setData(products);
    } catch (err) {
      console.error("Error loading products:", err);
      toast.error("Failed to load products.");
    }
  };

  useEffect(() => {
    loadProducts().finally(() => setLoading(false));

    customerService
      .getAll()
      .then((r: any) => {
        if (r?.isSuccess) setCustomers(r.result);
        else if (Array.isArray(r)) setCustomers(r);
      })
      .catch(console.error);

    productUnitService
      .getAll()
      .then((r: any) => {
        if (r?.isSuccess) setProductUnits(r.result);
        else if (Array.isArray(r)) setProductUnits(r);
      })
      .catch(console.error);

    console.log("productUnits:", productUnits);

    supplierService
      .getAll()
      .then((r: any) => {
        if (r?.isSuccess) setSuppliers(r.result);
        else if (Array.isArray(r)) setSuppliers(r);
      })
      .catch(console.error);

    // Build product categories from the constant list
    setProductCategories(
      PRODUCT_CATEGORIES.map((name, i) => ({
        id: name,
        name,
      })),
    );
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: Product) => {
    setEditTarget(row);
    setForm({
      productCode: row.productCode,
      categoryId: row.category?.id || "",
      customerId: row.customer?.id || "",
      productName: row.productName,
      description: row.description || "",
      productUnitId: row.unit?.id || "",
      costPerUnit: row.costPerUnit,
      pricePerUnit: row.pricePerUnit,
      supplierId: row.supplier?.id || "",
      status: row.status || "In Stock",
      minStock: row.minStock,
      begStock: row.begStock,
      qtyIn: row.qtyIn,
      actualStock: row.actualStock,
      reservedUnits: row.reservedUnits,
      qtyOut: row.qtyOut,
      inventoryFlag: row.inventoryFlag,
    });
    setError("");
    setModalOpen(true);
  };

  const lookupMaps = useMemo(
    () => ({
      categories: productCategories,
      customers,
      units: productUnits,
      suppliers,
    }),
    [productCategories, customers, productUnits, suppliers],
  );

  const handleSave = async () => {
    if (!form.productName.trim()) {
      setError("Product name is required.");
      return;
    }
    if (form.costPerUnit <= 0) {
      setError("Cost per unit must be greater than 0.");
      return;
    }
    if (!form.supplierId) {
      setError("Supplier selection is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        const updatePayload: UpdateProductPayload = {
          id: editTarget.id,
          ...buildCreatePayload(form, lookupMaps),
        };
        await productService.update(updatePayload);
        await loadProducts();
        toast.success("Product updated successfully.");
      } else {
        await productService.create(buildCreatePayload(form, lookupMaps));
        await loadProducts();
        toast.success("Product created successfully.");
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
      await productService.delete(deleteTarget.id);
      await loadProducts();
      toast.success(`"${deleteTarget.productName}" deleted successfully.`);
    } catch (err: any) {
      console.error("Delete error:", err);
      const errMsg = err.response?.data?.error || "Failed to delete product.";
      toast.error(errMsg);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleImport = async (file: File) => {
    let toastId: string | number | undefined;

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(dataBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        toast.error("The selected workbook contains no worksheets.");
        return;
      }

      const productsImport: CreateProductPayload[] = [];
      const headers: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(String(cell.value || "").trim());
          });
          return;
        }

        const rowData: Record<string, any> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const headerName = headers[colNumber - 1];
          if (headerName) {
            const cellValue =
              cell.value &&
              typeof cell.value === "object" &&
              "result" in cell.value
                ? cell.value.result
                : cell.value;
            rowData[headerName] = cellValue;
          }
        });

        const productName = String(rowData["Product Name"] || "").trim();
        const productCode = String(rowData["Product Code"] || "").trim();
        if (!productName || !productCode) return;

        const categoryName = String(rowData["Product Category"] || "").trim();
        const customerName = String(rowData["Customer Name"] || "").trim();

        productsImport.push({
          clientCode: "",
          productCode,
          category: { id: categoryName, name: categoryName },
          customer: {
            id: customerName,
            customerName,
            companyName: customerName,
            contactPerson: "",
            contactNumber: "",
            email: "",
            tin: "",
            address: "",
          },
          productName,
          description: String(rowData["Description"] || "").trim(),
          unit: {
            id: String(rowData["Unit"] || "").trim(),
            name: String(rowData["Unit"] || "").trim(),
          },
          costPerUnit: parseFloat(rowData["Cost Per Unit"]) || 0,
          pricePerUnit: rowData["Price Per Unit"]
            ? parseFloat(rowData["Price Per Unit"])
            : 0,
          supplier: {
            id: String(rowData["Supplier Name"] || "").trim(),
            supplierName: String(rowData["Supplier Name"] || "").trim(),
            tin: "",
            address: "",
            status: "",
          },
          status: "In Stock",
          minStock: parseInt(rowData["Min Stock"]) || 0,
          begStock: parseInt(rowData["Beg Stock"]) || 0,
          qtyIn: parseInt(rowData["Qty In"] || rowData["Quantity In"]) || 0,
          actualStock: parseInt(rowData["Actual Stock"]) || 0,
          reservedUnits: parseInt(rowData["Reserved Units"]) || 0,
          qtyOut: parseInt(rowData["Qty Out"] || rowData["Quantity Out"]) || 0,
          inventoryFlag: String(rowData["Inventory Flag"] || "").trim(),
        });
      });

      if (productsImport.length === 0) {
        toast.error(
          "No valid product items found inside the selected workbook.",
        );
        return;
      }

      toastId = toast.loading(
        "Clearing existing records and preparing import...",
      );

      try {
        const currentProducts = await productService.getAll();
        if (Array.isArray(currentProducts)) {
          for (const existingProduct of currentProducts) {
            await productService.delete(existingProduct.id);
          }
        }
      } catch (clearErr) {
        console.error("Failed to clear previous records:", clearErr);
        toast.error("Failed to reset existing product list. Import aborted.", {
          id: toastId,
        });
        return;
      }

      toast.loading(`Importing ${productsImport.length} fresh records...`, {
        id: toastId,
      });

      let successCount = 0;
      let failCount = 0;

      for (const product of productsImport) {
        try {
          await productService.create(product);
          successCount++;
        } catch {
          failCount++;
        }
      }

      await loadProducts();

      if (failCount === 0) {
        toast.success(`Successfully imported ${successCount} products.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `Imported ${successCount} products. ${failCount} failed.`,
          {
            id: toastId,
          },
        );
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to complete workbook import.", {
        id: toastId,
      });
    }
  };

  return (
    <>
      <EntityTable
        title="Product List"
        columns={columns}
        data={data}
        loading={loading}
        onCreateNew={openCreate}
        onEdit={openEdit}
        onDelete={(row) => setDeleteTarget(row)}
        onExport={() => exportToExcel(data)}
        onImport={handleImport}
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(v) => {
          if (!saving) setModalOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Product" : "Create Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Product Code */}
            <div className="space-y-1.5">
              <Label htmlFor="p-code">Product Code *</Label>
              <Input
                id="p-code"
                value={form.productCode}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, productCode: e.target.value }))
                }
              />
            </div>

            {/* Product Category */}
            <div className="space-y-1.5">
              <Label htmlFor="p-category">Product Category *</Label>
              <Select
                value={form.categoryId}
                disabled={saving}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger id="p-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {productCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer */}
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <SearchableSelect
                value={form.customerId}
                onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
                placeholder="Select customer"
                searchPlaceholder="Search customers..."
                disabled={saving}
                options={customers.map((c) => ({
                  value: c.id,
                  label:
                    c.customerName ||
                    c.companyName ||
                    `Unnamed Customer (ID: ${c.id})`,
                }))}
              />
            </div>

            {/* Product Name */}
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Product Name *</Label>
              <Input
                id="p-name"
                value={form.productName}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, productName: e.target.value }))
                }
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Input
                id="p-desc"
                value={form.description}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            {/* Unit */}
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <Select
                value={form.productUnitId}
                disabled={saving}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, productUnitId: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {productUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cost & Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">Cost / Unit *</Label>
                <Input
                  id="p-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.costPerUnit}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      costPerUnit: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Price / Unit</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.pricePerUnit ?? ""}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pricePerUnit: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>
            </div>

            {/* Supplier */}
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select
                value={form.supplierId}
                disabled={saving}
                onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="p-status">Status</Label>
              <Select
                value={form.status}
                disabled={saving}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as ProductStatus }))
                }
              >
                <SelectTrigger id="p-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Min Stock */}
            <div className="space-y-1.5">
              <Label htmlFor="p-min-stock">Min Stock</Label>
              <Input
                id="p-min-stock"
                type="number"
                min={0}
                value={form.minStock}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    minStock: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            {/* Beg Stock */}
            <div className="space-y-1.5">
              <Label htmlFor="p-beg-stock">Beg Stock</Label>
              <Input
                id="p-beg-stock"
                type="number"
                min={0}
                value={form.begStock}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    begStock: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            {/* Qty In */}
            <div className="space-y-1.5">
              <Label htmlFor="p-qtyIn">Qty In</Label>
              <Input
                id="p-qtyIn"
                type="number"
                min={0}
                value={form.qtyIn}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    qtyIn: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            {/* Actual Stock */}
            <div className="space-y-1.5">
              <Label htmlFor="p-actual-stock">Actual Stock</Label>
              <Input
                id="p-actual-stock"
                type="number"
                min={0}
                value={form.actualStock}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    actualStock: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            {/* Reserved Units */}
            <div className="space-y-1.5">
              <Label htmlFor="p-reserved-units">Reserved Units</Label>
              <Input
                id="p-reserved-units"
                type="number"
                min={0}
                value={form.reservedUnits}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    reservedUnits: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            {/* Qty Out */}
            <div className="space-y-1.5">
              <Label htmlFor="p-qty-out">Qty Out</Label>
              <Input
                id="p-qty-out"
                type="number"
                min={0}
                value={form.qtyOut}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    qtyOut: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            {/* Inventory Flag */}
            <div className="space-y-1.5">
              <Label htmlFor="p-inventory-flag">Inventory Flag</Label>
              <Input
                id="p-inventory-flag"
                value={form.inventoryFlag}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    inventoryFlag: e.target.value,
                  }))
                }
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
        description={`Delete product "${deleteTarget?.productName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

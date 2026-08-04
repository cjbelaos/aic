"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2, Users } from "lucide-react";
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
import supplierService from "@/lib/services/supplier.service";
import { Supplier, CreateSupplierPayload } from "@/types/supplier";
import { SupplierContactsDrawer } from "@/components/supplier-contacts-drawer";

let openContactsFor: (s: Supplier) => void = () => {};

function exportToExcel(rows: Supplier[]) {
  if (rows.length === 0) {
    toast.error("No supplier records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Suppliers");

  worksheet.columns = [
    { header: "Supplier ID", key: "supplierId", width: 15 },
    { header: "Supplier Name", key: "supplierName", width: 25 },
    { header: "TIN", key: "tin", width: 15 },
    { header: "Address", key: "addressLine", width: 35 },
    { header: "City/Municipality", key: "city", width: 20 },
    { header: "Province", key: "province", width: 20 },
    { header: "Country", key: "country", width: 15 },
    { header: "Delivery Lead Time", key: "deliveryLeadTime", width: 15 },
    { header: "Delivery Terms", key: "deliveryTerms", width: 20 },
    { header: "Payment Terms", key: "paymentTerms", width: 20 },
    { header: "Status", key: "status", width: 12 },
  ];

  rows.forEach((r) => {
    worksheet.addRow({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      tin: r.tin,
      addressLine: r.addressLine,
      city: r.city,
      province: r.province,
      country: r.country,
      deliveryLeadTime: r.deliveryLeadTime,
      deliveryTerms: r.deliveryTerms,
      paymentTerms: r.paymentTerms,
      status: r.status === "active" ? "Active" : "Inactive",
    });
  });

  workbook.xlsx
    .writeBuffer()
    .then((buffer) => {
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "suppliers.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    })
    .catch((err) => {
      console.error("Excel generation failed:", err);
      toast.error("Failed to generate Excel download file.");
    });
}

const EMPTY_FORM: CreateSupplierPayload = {
  supplierId: "",
  supplierName: "",
  tin: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  deliveryLeadTime: "",
  deliveryTerms: "",
  paymentTerms: "",
  status: "active",
};

const columns: ColumnDef<Supplier>[] = [
  {
    accessorKey: "supplierName",
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
    cell: ({ row }) => (
      <span className="text-blue-600 font-medium">
        {row.original.supplierName}
      </span>
    ),
  },
  {
    accessorKey: "tin",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        TIN <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "addressLine",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Address <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  { accessorKey: "city", header: "City/Municipality" },
  { accessorKey: "province", header: "Province" },
  { accessorKey: "country", header: "Country" },
  { accessorKey: "deliveryLeadTime", header: "Delivery Lead Time" },
  { accessorKey: "deliveryTerms", header: "Delivery Terms" },
  { accessorKey: "paymentTerms", header: "Payment Terms" },
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
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "active" ? "default" : "secondary"}
      >
        {row.original.status === "active" ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "contacts",
    header: "Contacts",
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 h-8 text-blue-600 hover:text-blue-700"
        onClick={() => openContactsFor?.(row.original)}
      >
        <Users className="h-4 w-4" />
        View
      </Button>
    ),
  },
];

export default function SuppliersPage() {
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState<CreateSupplierPayload>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [contactsSupplier, setContactsSupplier] = useState<Supplier | null>(
    null,
  );

  useEffect(() => {
    openContactsFor = (s) => setContactsSupplier(s);
  }, []);

  const loadSuppliers = async () => {
    try {
      const suppliers = await supplierService.getAll();
      setData(suppliers);
    } catch {
      toast.error("Failed to load suppliers.");
    }
  };

  useEffect(() => {
    loadSuppliers().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: Supplier) => {
    setEditTarget(row);
    setForm({
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      tin: row.tin,
      addressLine: row.addressLine,
      city: row.city,
      province: row.province,
      country: row.country,
      deliveryLeadTime: row.deliveryLeadTime,
      deliveryTerms: row.deliveryTerms,
      paymentTerms: row.paymentTerms,
      status: row.status,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.supplierName.trim()) {
      setError("Supplier name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        await supplierService.update({
          ...form,
          id: editTarget.id,
        });
        await loadSuppliers();
        toast.success("Supplier updated successfully.");
      } else {
        await supplierService.create(form);
        await loadSuppliers();
        toast.success("Supplier created successfully.");
      }
      setModalOpen(false);
    } catch (err) {
      console.error("Save error:", err);
      setError("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await supplierService.delete(deleteTarget.id);
      await loadSuppliers();
      toast.success(`"${deleteTarget.supplierName}" deleted successfully.`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete supplier.");
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

      const suppliersToImport: CreateSupplierPayload[] = [];
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

        const supplierName = String(rowData["Supplier Name"] || "").trim();
        if (!supplierName) return;

        const rawStatus = String(rowData["Status"] || "")
          .toLowerCase()
          .trim();
        const status = rawStatus === "active" ? "active" : "inactive";

        suppliersToImport.push({
          supplierId: String(rowData["Supplier ID"] || "").trim(),
          supplierName,
          tin: String(rowData["TIN"] || "").trim(),
          addressLine: String(rowData["Address"] || "").trim(),
          city: String(rowData["City/Municipality"] || "").trim(),
          province: String(rowData["Province"] || "").trim(),
          country: String(rowData["Country"] || "").trim(),
          deliveryLeadTime: String(rowData["Delivery Lead Time"] || "").trim(),
          deliveryTerms: String(rowData["Delivery Terms"] || "").trim(),
          paymentTerms: String(rowData["Payment Terms"] || "").trim(),
          status,
        });
      });

      if (suppliersToImport.length === 0) {
        toast.error(
          "No valid supplier profiles found inside the selected workbook.",
        );
        return;
      }

      toastId = toast.loading(
        "Clearing existing records and preparing import...",
      );

      try {
        const currentData = await supplierService.getAll();
        for (const existingSupplier of currentData) {
          await supplierService.delete(existingSupplier.id);
        }
      } catch (clearErr) {
        console.error("Failed to clear previous records:", clearErr);
        toast.error("Failed to reset existing supplier list. Import aborted.", {
          id: toastId,
        });
        return;
      }

      toast.loading(`Importing ${suppliersToImport.length} fresh records...`, {
        id: toastId,
      });

      let successCount = 0;
      let failCount = 0;

      for (const supplier of suppliersToImport) {
        try {
          const res = await supplierService.create(supplier);
          if (res) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      await loadSuppliers();

      if (failCount === 0) {
        toast.success(`Successfully imported ${successCount} suppliers.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `Imported ${successCount} suppliers. ${failCount} failed.`,
          { id: toastId },
        );
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to complete workbook import parsing layout.", {
        id: toastId,
      });
    }
  };

  return (
    <>
      <EntityTable
        title="Supplier List"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Supplier" : "Create Supplier"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Supplier Name *</Label>
              <Input
                id="s-name"
                value={form.supplierName}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplierName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-tin">TIN</Label>
              <Input
                id="s-tin"
                value={form.tin}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-address">Address</Label>
              <Input
                id="s-address"
                value={form.addressLine}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, addressLine: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-city">City/Municipality</Label>
              <Input
                id="s-city"
                value={form.city}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-province">Province</Label>
              <Input
                id="s-province"
                value={form.province}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, province: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-country">Country</Label>
              <Input
                id="s-country"
                value={form.country}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, country: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-lead-time">Delivery Lead Time</Label>
              <Input
                id="s-lead-time"
                value={form.deliveryLeadTime}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deliveryLeadTime: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-delivery-terms">Delivery Terms</Label>
              <Input
                id="s-delivery-terms"
                value={form.deliveryTerms}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deliveryTerms: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-payment-terms">Payment Terms</Label>
              <Input
                id="s-payment-terms"
                value={form.paymentTerms}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentTerms: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-status">Status</Label>
              <Select
                value={form.status}
                disabled={saving}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as "active" | "inactive" }))
                }
              >
                <SelectTrigger id="s-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
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
        description={`Delete supplier "${deleteTarget?.supplierName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <SupplierContactsDrawer
        supplier={contactsSupplier}
        open={!!contactsSupplier}
        onOpenChange={(v) => {
          if (!v) setContactsSupplier(null);
        }}
      />
    </>
  );
}

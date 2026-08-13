"use client";

import { useEffect, useState } from "react";
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
import companyService from "@/lib/services/company.service";
import { Company, CompanyType, CreateCompanyPayload } from "@/types/company";

function exportToExcel(rows: Company[]) {
  if (rows.length === 0) {
    toast.error("No customer records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Customers");

  worksheet.columns = [
    { header: "Company Name", key: "companyName", width: 25 },
    { header: "TIN", key: "tin", width: 18 },
    { header: "Address", key: "address", width: 35 },
    { header: "Status", key: "status", width: 12 },
  ];

  rows.forEach((r) => {
    worksheet.addRow({
      companyName: r.companyName,
      tin: r.tin,
      address: r.address,
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
      link.download = "customers.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    })
    .catch((err) => {
      console.error("Excel generation failed:", err);
      toast.error("Failed to generate Excel download file.");
    });
}

const EMPTY_FORM: CreateCompanyPayload = {
  companyId: "",
  companyType: "Customer",
  companyName: "",
  tin: "",
  address: "",
  latitude: undefined,
  longitude: undefined,
  status: "active",
};

function isCustomerType(t: CompanyType): boolean {
  return t === "Customer" || t === "Both";
}

const columns: ColumnDef<Company>[] = [
  {
    accessorKey: "companyName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Company Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-blue-600 font-medium">
        {row.original.companyName}
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
    cell: ({ row }) => <span>{row.original.tin || "—"}</span>,
  },
  {
    accessorKey: "address",
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
    cell: ({ row }) => <span>{row.original.address || "—"}</span>,
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
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "active" ? "default" : "secondary"}
      >
        {row.original.status === "active" ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

export default function CustomersPage() {
  const [data, setData] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Company | null>(null);
  const [form, setForm] = useState<CreateCompanyPayload>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const loadCustomers = async () => {
    try {
      const companies = await companyService.getAll();
      const customers = companies.filter((c) => isCustomerType(c.companyType));
      setData(customers);
    } catch {
      toast.error("Failed to load customers.");
    }
  };

  useEffect(() => {
    loadCustomers().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: Company) => {
    setEditTarget(row);
    setForm({
      companyId: row.companyId,
      companyType: row.companyType,
      companyName: row.companyName,
      tin: row.tin,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        await companyService.update({
          ...form,
          id: editTarget.id,
        });
        await loadCustomers();
        toast.success("Customer updated successfully.");
      } else {
        await companyService.create({
          ...form,
          companyType: "Customer",
        });
        await loadCustomers();
        toast.success("Customer created successfully.");
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
      await companyService.delete(deleteTarget.id);
      await loadCustomers();
      toast.success(`"${deleteTarget.companyName}" deleted successfully.`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete customer.");
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

      const customersToImport: CreateCompanyPayload[] = [];
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

        const companyName = String(
          rowData["Company Name"] || rowData["Customer Name"] || "",
        ).trim();
        if (!companyName) return;

        const rawStatus = String(rowData["Status"] || "")
          .toLowerCase()
          .trim();
        const status = rawStatus === "inactive" ? "inactive" : "active";

        const rawLat = parseFloat(String(rowData["Latitude"] || ""));
        const rawLng = parseFloat(String(rowData["Longitude"] || ""));

        customersToImport.push({
          companyId: String(rowData["Company ID"] || "").trim(),
          companyType: "Customer",
          companyName,
          tin: String(rowData["TIN"] || "").trim(),
          address: String(rowData["Address"] || "").trim(),
          latitude: isNaN(rawLat) ? undefined : rawLat,
          longitude: isNaN(rawLng) ? undefined : rawLng,
          status,
        });
      });

      if (customersToImport.length === 0) {
        toast.error(
          "No valid customer profiles found inside the selected workbook.",
        );
        return;
      }

      toastId = toast.loading(
        "Clearing existing records and preparing import...",
      );

      try {
        await companyService.getAll();
      } catch (clearErr) {
        console.error("Failed to verify company records:", clearErr);
        toast.error("Failed to reset existing customer list. Import aborted.", {
          id: toastId,
        });
        return;
      }

      toast.loading(`Importing ${customersToImport.length} fresh records...`, {
        id: toastId,
      });

      let successCount = 0;
      let failCount = 0;

      for (const customer of customersToImport) {
        try {
          const res = await companyService.create(customer);
          if (res) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      await loadCustomers();

      if (failCount === 0) {
        toast.success(`Successfully imported ${successCount} customers.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `Imported ${successCount} customers. ${failCount} failed.`,
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
        title="Customer List"
        columns={columns}
        data={data}
        loading={loading}
        onCreateNew={openCreate}
        onEdit={openEdit}
        onDelete={(row) => setDeleteTarget(row)}
        onExport={exportToExcel}
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
              {editTarget ? "Edit Customer" : "Create Customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Company Name *</Label>
              <Input
                id="c-name"
                value={form.companyName}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, companyName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tin">TIN</Label>
              <Input
                id="c-tin"
                value={form.tin}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-address">Address</Label>
              <Input
                id="c-address"
                value={form.address}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-status">Status</Label>
              <Select
                value={form.status}
                disabled={saving}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as "active" | "inactive" }))
                }
              >
                <SelectTrigger id="c-status" className="w-full">
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
        description={`Delete customer "${deleteTarget?.companyName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

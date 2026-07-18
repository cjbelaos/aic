"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
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
import customerService from "@/lib/services/customer.service";
import { Customer, CreateCustomerPayload } from "@/types/customer";

// Exports data safely using ExcelJS buffer streams
function exportToExcel(rows: Customer[]) {
  if (rows.length === 0) {
    toast.error("No customer records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Customers");

  worksheet.columns = [
    { header: "Customer Name", key: "customerName", width: 25 },
    { header: "Company Name", key: "companyName", width: 25 },
    { header: "Contact Person", key: "contactPerson", width: 20 },
    { header: "Contact Number", key: "contactNumber", width: 18 },
    { header: "Email Address", key: "email", width: 25 },
    { header: "TIN", key: "tin", width: 15 },
    { header: "Address", key: "address", width: 35 },
  ];

  rows.forEach((r) => {
    worksheet.addRow({
      customerName: r.customerName,
      contactPerson: r.contactPerson,
      contactNumber: r.contactNumber,
      email: r.email,
      tin: r.tin,
      address: r.address,
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

const EMPTY_FORM: CreateCustomerPayload = {
  customerName: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  tin: "",
  address: "",
};

const columns: ColumnDef<Customer>[] = [
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
    cell: ({ row }) => (
      <span className="text-blue-600 font-medium">
        {row.original.customerName}
      </span>
    ),
  },
  {
    accessorKey: "contactPerson",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Contact Person <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "contactNumber",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Contact Number <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Email Address <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
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
  },
];

export default function CustomersPage() {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState<CreateCustomerPayload>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const loadCustomers = async () => {
    try {
      const customers = await customerService.getAll();
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

  const openEdit = (row: Customer) => {
    setEditTarget(row);
    setForm({
      customerName: row.customerName,
      contactPerson: row.contactPerson,
      contactNumber: row.contactNumber,
      email: row.email,
      tin: row.tin,
      address: row.address,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }

    setSaving(true);
    setError("");

    // Standard entries are capitalized; Email is explicitly set to lowercase
    const transformedForm: CreateCustomerPayload = {
      customerName: form.customerName.trim().toUpperCase(),
      contactPerson: form.contactPerson.trim().toUpperCase(),
      contactNumber: form.contactNumber.trim().toUpperCase(),
      email: form.email.trim().toLowerCase(),
      tin: form.tin.trim().toUpperCase(),
      address: form.address.trim().toUpperCase(),
    };

    try {
      if (editTarget) {
        await customerService.update({
          ...transformedForm,
          id: editTarget.id,
        });
        await loadCustomers();
        toast.success("Customer updated successfully.");
      } else {
        // await customerService.create(transformedForm);
        // await loadCustomers();
        // toast.success("Customer created successfully.");
      }
      setModalOpen(false);
    } catch (err) {
      console.error("Save error:", err);
      setError("Server error encountered updating customer profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await customerService.delete(deleteTarget.id);
      await loadCustomers();
      toast.success(`"${deleteTarget.customerName}" deleted successfully.`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete customer configuration.");
    } finally {
      setDeleteTarget(null);
    }
  };

  // Modernized: Import handler utilizing ExcelJS buffer reads exclusively
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

      const customersToImport: CreateCustomerPayload[] = [];
      const headers: string[] = [];

      // Parse the sheet row by row manually
      worksheet.eachRow((row, rowNumber) => {
        // Collect header text positions from the first row entry
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(String(cell.value || "").trim());
          });
          return;
        }

        // Build a dynamic object representing row cell values mapped to headers
        const rowData: Record<string, any> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const headerName = headers[colNumber - 1];
          if (headerName) {
            // Check if cell is a formula or an object, extract primitive string text
            const cellValue =
              cell.value &&
              typeof cell.value === "object" &&
              "result" in cell.value
                ? cell.value.result
                : cell.value;
            rowData[headerName] = cellValue;
          }
        });

        // Map spreadsheet records applying uppercase formatting generally and lowercase strictly to email structures
        customersToImport.push({
          customerName: String(rowData["Customer Name"] || "")
            .trim()
            .toUpperCase(),
          contactPerson: String(rowData["Contact Person"] || "")
            .trim()
            .toUpperCase(),
          contactNumber: String(rowData["Contact Number"] || "")
            .trim()
            .toUpperCase(),
          email: String(rowData["Email Address"] || "")
            .trim()
            .toLowerCase(),
          tin: String(rowData["TIN"] || "")
            .trim()
            .toUpperCase(),
          address: String(rowData["Address"] || "")
            .trim()
            .toUpperCase(),
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
        const currentData = await customerService.getAll();
        for (const existingCustomer of currentData) {
          await customerService.delete(existingCustomer.id);
        }
      } catch (clearErr) {
        console.error("Failed to clear previous records:", clearErr);
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
          const res = await customerService.create(customer);
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
              <Label htmlFor="c-name">Customer Name *</Label>
              <Input
                id="c-name"
                value={form.customerName}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customerName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-contact-person">Contact Person</Label>
              <Input
                id="c-contact-person"
                value={form.contactPerson}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactPerson: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-contact-number">Contact Number</Label>
              <Input
                id="c-contact-number"
                value={form.contactNumber}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactNumber: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email Address</Label>
              <Input
                id="c-email"
                value={form.email}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
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
        description={`Delete customer "${deleteTarget?.customerName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

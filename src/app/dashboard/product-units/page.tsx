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
import productUnitService from "@/lib/services/product-unit.service";
import { ProductUnit, CreateProductUnitPayload } from "@/types/product-unit";

/* ── Excel export ─────────────────────────────────────────── */
function exportToExcel(rows: ProductUnit[]) {
  if (rows.length === 0) {
    toast.error("No product unit records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("ProductUnits");

  worksheet.columns = [{ header: "Name", key: "name", width: 25 }];

  rows.forEach((r) => {
    worksheet.addRow({ name: r.name });
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
      link.download = "product_units.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    })
    .catch((err) => {
      console.error("Excel generation failed:", err);
      toast.error("Failed to generate Excel download file.");
    });
}

const EMPTY_FORM: CreateProductUnitPayload = {
  name: "",
};

/* ── columns ────────────────────────────────────────────── */
const columns: ColumnDef<ProductUnit>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Unit Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-blue-600 font-medium">{row.original.name}</span>
    ),
  },
];

/* ── page ───────────────────────────────────────────────── */
export default function ProductUnitsPage() {
  const [data, setData] = useState<ProductUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductUnit | null>(null);
  const [form, setForm] = useState<CreateProductUnitPayload>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ProductUnit | null>(null);

  const loadProductUnits = async () => {
    try {
      const productUnits = await productUnitService.getAll();
      console.log("Fetched product units:", productUnits);
      setData(productUnits);
    } catch {
      toast.error("Failed to load product units.");
    }
  };

  useEffect(() => {
    loadProductUnits().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: ProductUnit) => {
    setEditTarget(row);
    setForm({ name: row.name });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Unit name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        await productUnitService.update({
          id: editTarget.id,
          name: form.name,
        });
        toast.success("Product unit updated successfully.");
      } else {
        await productUnitService.create(form);
        toast.success("Product unit created successfully.");
      }
      await loadProductUnits();
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
      await productUnitService.delete(deleteTarget.id);
      await loadProductUnits();
      toast.success(`"${deleteTarget.name}" deleted successfully.`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete product unit.");
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

      const productUnitsToImport: CreateProductUnitPayload[] = [];
      const headers: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(
              String(cell.value || "")
                .trim()
                .toLowerCase(),
            );
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

        const unitName = String(
          rowData["name"] || rowData["unit name"] || "",
        ).trim();
        if (!unitName) return;

        productUnitsToImport.push({ name: unitName });
      });

      if (productUnitsToImport.length === 0) {
        toast.error(
          "No valid product units found inside the selected workbook.",
        );
        return;
      }

      toastId = toast.loading(
        "Clearing existing records and preparing import...",
      );

      try {
        const currentData = await productUnitService.getAll();
        for (const existingUnit of currentData) {
          await productUnitService.delete(existingUnit.id);
        }
      } catch (clearErr) {
        console.error("Failed to clear previous records:", clearErr);
        toast.error("Failed to reset existing list. Import aborted.", {
          id: toastId,
        });
        return;
      }

      toast.loading(
        `Importing ${productUnitsToImport.length} fresh records...`,
        { id: toastId },
      );

      let successCount = 0;
      let failCount = 0;

      for (const unit of productUnitsToImport) {
        try {
          await productUnitService.create(unit);
          successCount++;
        } catch {
          failCount++;
        }
      }

      await loadProductUnits();

      if (failCount === 0) {
        toast.success(`Successfully imported ${successCount} product units.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `Imported ${successCount} product units. ${failCount} failed.`,
          { id: toastId },
        );
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to complete workbook import layout parsing.", {
        id: toastId,
      });
    }
  };

  return (
    <>
      <EntityTable
        title="Product Unit List"
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
              {editTarget ? "Edit Product Unit" : "Create Product Unit"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Unit Name *</Label>
              <Input
                id="u-name"
                value={form.name}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
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
        description={`Delete product unit "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

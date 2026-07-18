"use client";

import { useEffect, useState } from "react";
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

// Services
import productCategoryService from "@/lib/services/product-category.service";

// Types
import {
  ProductCategory,
  CreateProductCategoryPayload,
  UpdateProductCategoryPayload,
} from "@/types/product-category";

/* ── Form state ─────────────────────────────────────────── */
interface ProductCategoryFormState {
  code: string;
  name: string;
}

const EMPTY_FORM: ProductCategoryFormState = {
  code: "",
  name: "",
};

/* ── Helper: build CreateProductCategoryPayload from form state ── */
function buildCreatePayload(
  form: ProductCategoryFormState,
): CreateProductCategoryPayload {
  return {
    code: form.code,
    name: form.name,
  };
}

/* ── Columns ────────────────────────────────────────────── */
const columns: ColumnDef<ProductCategory>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Code <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
];

/* ── Page ───────────────────────────────────────────────── */
export default function ProductCategoriesPage() {
  const [data, setData] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState<ProductCategoryFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(
    null,
  );

  const loadCategories = async () => {
    try {
      const categories = await productCategoryService.getAll();
      setData(categories);
    } catch (err) {
      console.error("Error loading product categories:", err);
      toast.error("Failed to load product categories.");
    }
  };

  useEffect(() => {
    loadCategories().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: ProductCategory) => {
    setEditTarget(row);
    setForm({
      code: row.code,
      name: row.name,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    // Client-side validation
    if (!form.code.trim()) {
      setError("Category code is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Category name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        const updatePayload: UpdateProductCategoryPayload = {
          id: editTarget.id,
          ...buildCreatePayload(form),
        };
        await productCategoryService.update(updatePayload);
        await loadCategories();
        toast.success("Product category updated successfully.");
      } else {
        await productCategoryService.create(buildCreatePayload(form));
        await loadCategories();
        toast.success("Product category created successfully.");
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
      await productCategoryService.delete(deleteTarget.id);
      await loadCategories();
      toast.success(`Category "${deleteTarget.name}" deleted successfully.`);
    } catch (err: any) {
      console.error("Delete error:", err);
      const errMsg =
        err.response?.data?.error || "Failed to delete product category.";
      toast.error(errMsg);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <EntityTable
        title="Product Categories"
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
              {editTarget ? "Edit Product Category" : "Create Product Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Code */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-code">Code *</Label>
              <Input
                id="pc-code"
                value={form.code}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="e.g., CO, PA, PR, RE, SU, SE, TR"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-name">Name *</Label>
              <Input
                id="pc-name"
                value={form.name}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., Consumables, Parts, Project"
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
        description={`Delete category "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

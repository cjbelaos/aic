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
import positionService from "@/lib/services/position.service";
import { Position } from "@/types/position";

export default function PositionsPage() {
  const [data, setData] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Position | null>(null);
  const [title, setTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null);

  const loadPositions = async () => {
    try {
      const positions = await positionService.getAll();
      setData(positions);
    } catch (err) {
      console.error("Error loading positions:", err);
      toast.error("Failed to load positions.");
    }
  };

  useEffect(() => {
    loadPositions().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setTitle("");
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: Position) => {
    setEditTarget(row);
    setTitle(row.positionTitle);
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Position title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editTarget) {
        await positionService.update(String(editTarget.positionId), {
          positionTitle: title.trim(),
        });
        await loadPositions();
        toast.success("Position updated successfully.");
      } else {
        await positionService.create({ positionTitle: title.trim() });
        await loadPositions();
        toast.success("Position created successfully.");
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error("Save error:", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Server error. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await positionService.delete(String(deleteTarget.positionId));
      await loadPositions();
      toast.success(`Position "${deleteTarget.positionTitle}" deleted.`);
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(err?.response?.data?.error || "Failed to delete position.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<Position>[] = [
    {
      accessorKey: "positionId",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          ID <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ getValue }) => (
        <span className="font-semibold tabular-nums">{String(getValue())}</span>
      ),
    },
    {
      accessorKey: "positionTitle",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Position Title <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="p-6 space-y-6">
        <EntityTable
          title="Positions"
          columns={columns}
          data={data}
          loading={loading}
          onCreateNew={openCreate}
          onEdit={openEdit}
          onDelete={(row) => setDeleteTarget(row)}
        />
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(v) => {
          if (!saving) setModalOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Position" : "Create Position"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label>
                Position Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                disabled={saving}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Technician, Supervisor, Accountant"
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
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        description={`Delete position "${deleteTarget?.positionTitle}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import vehicleService from "@/lib/services/vehicle.service";
import { Vehicle } from "@/types/vehicle";

interface VehicleFormState {
  vehicleId: string;
  makeAndModel: string;
  licensePlate: string;
  year: string;
  currentMileage: string;
  lastPmsDate: string;
  nextPmsDate: string;
  nextPmsMileage: string;
  registrationExpiry: string;
  insuranceExpiry: string;
  status: "active" | "inactive";
}

const EMPTY_FORM: VehicleFormState = {
  vehicleId: "",
  makeAndModel: "",
  licensePlate: "",
  year: "",
  currentMileage: "",
  lastPmsDate: "",
  nextPmsDate: "",
  nextPmsMileage: "",
  registrationExpiry: "",
  insuranceExpiry: "",
  status: "active",
};

export default function VehiclesPage() {
  const [data, setData] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  const loadVehicles = async () => {
    try {
      const vehicles = await vehicleService.getAll();
      setData(vehicles);
    } catch (err) {
      console.error("Error loading vehicles:", err);
      toast.error("Failed to load vehicles.");
    }
  };

  useEffect(() => {
    loadVehicles().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: Vehicle) => {
    setEditTarget(row);
    setForm({
      vehicleId: row.vehicleId,
      makeAndModel: row.makeAndModel,
      licensePlate: row.licensePlate,
      year: row.year || "",
      currentMileage: row.currentMileage || "",
      lastPmsDate: row.lastPmsDate || "",
      nextPmsDate: row.nextPmsDate || "",
      nextPmsMileage: row.nextPmsMileage || "",
      registrationExpiry: row.registrationExpiry || "",
      insuranceExpiry: row.insuranceExpiry || "",
      status: row.status,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.makeAndModel.trim()) {
      setError("Make & Model is required.");
      return;
    }
    if (!form.licensePlate.trim()) {
      setError("License Plate is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const basePayload = {
        makeAndModel: form.makeAndModel.trim(),
        licensePlate: form.licensePlate.trim(),
        year: form.year,
        currentMileage: form.currentMileage,
        lastPmsDate: form.lastPmsDate,
        nextPmsDate: form.nextPmsDate,
        nextPmsMileage: form.nextPmsMileage,
        registrationExpiry: form.registrationExpiry,
        insuranceExpiry: form.insuranceExpiry,
        status: form.status,
      };
      if (editTarget) {
        await vehicleService.update(editTarget.vehicleId, basePayload);
        await loadVehicles();
        toast.success(`Vehicle "${editTarget.vehicleId}" updated.`);
      } else {
        await vehicleService.create(basePayload);
        await loadVehicles();
        toast.success("Vehicle created successfully.");
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error("Save error:", err);
      const errMsg =
        err?.response?.data?.error ||
        err?.message ||
        "Server error. Please try again.";
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vehicleService.delete(deleteTarget.vehicleId);
      await loadVehicles();
      toast.success(`Vehicle "${deleteTarget.vehicleId}" deleted.`);
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(err?.response?.data?.error || "Failed to delete vehicle.");
    } finally {
      setDeleteTarget(null);
    }
  };
const columns: ColumnDef<Vehicle>[] = [
    {
      accessorKey: "vehicleId",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Vehicle ID <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ getValue }) => (
        <span className="font-semibold tabular-nums">{String(getValue())}</span>
      ),
    },
    {
      accessorKey: "makeAndModel",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Make & Model <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
    {
      accessorKey: "licensePlate",
      header: "License Plate",
      cell: ({ getValue }) => (
        <span className="uppercase tabular-nums">{String(getValue())}</span>
      ),
    },
    {
      accessorKey: "year",
      header: "Year",
    },
    {
      accessorKey: "currentMileage",
      header: "Cur. Mileage",
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return v ? <span className="tabular-nums">{v}</span> : <span>—</span>;
      },
    },
    {
      accessorKey: "lastPmsDate",
      header: "Last PMS",
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return v ? <span className="tabular-nums">{v}</span> : <span>—</span>;
      },
    },
    {
      accessorKey: "nextPmsDate",
      header: "Next PMS",
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return v ? <span className="tabular-nums">{v}</span> : <span>—</span>;
      },
    },
    {
      accessorKey: "registrationExpiry",
      header: "Reg. Expiry",
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return v ? <span className="tabular-nums">{v}</span> : <span>—</span>;
      },
    },
    {
      accessorKey: "insuranceExpiry",
      header: "Ins. Expiry",
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return v ? <span className="tabular-nums">{v}</span> : <span>—</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const s = String(getValue() ?? "active");
        return (
          <Badge variant={s === "active" ? "default" : "secondary"}>
            {s === "active" ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
  ];
return (
    <>
      <div className="p-6 space-y-6">
        <EntityTable
          title="Vehicles"
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
        <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Vehicle" : "Create Vehicle"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Vehicle ID</Label>
                <Input
                  value={editTarget ? form.vehicleId : "Auto-generated"}
                  readOnly
                  className="bg-muted"
                  placeholder="Auto-generated (VEH-n)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Make & Model <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.makeAndModel}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, makeAndModel: e.target.value }))
                  }
                  placeholder="e.g., Toyota Hilux"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  License Plate <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.licensePlate}
                  className="uppercase"
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      licensePlate: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="e.g., ABC-123"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input
                  value={form.year}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, year: e.target.value }))
                  }
                  placeholder="e.g., 2022"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Current Mileage</Label>
                <Input
                  value={form.currentMileage}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currentMileage: e.target.value }))
                  }
                  placeholder="e.g., 45000 km"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Next PMS Mileage</Label>
                <Input
                  value={form.nextPmsMileage}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nextPmsMileage: e.target.value }))
                  }
                  placeholder="e.g., 50000 km"
                />
              </div>
<div className="space-y-1.5">
                <Label>Last PMS Date</Label>
                <Input
                  type="date"
                  value={form.lastPmsDate}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastPmsDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Next PMS Date</Label>
                <Input
                  type="date"
                  value={form.nextPmsDate}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nextPmsDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Registration Expiry</Label>
                <Input
                  type="date"
                  value={form.registrationExpiry}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      registrationExpiry: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Insurance Expiry</Label>
                <Input
                  type="date"
                  value={form.insuranceExpiry}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, insuranceExpiry: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      status: v as "active" | "inactive",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
        description={`Delete vehicle "${deleteTarget?.vehicleId}" (${deleteTarget?.makeAndModel})? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
"use client";

import { useCallback, useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Pencil, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityTable } from "@/components/ui/entity-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import warehouseService from "@/lib/services/warehouse.service";
import type { Warehouse, WarehouseInput } from "@/types/warehouse";

const EMPTY: WarehouseInput = { code: "", name: "", addressLines: "", cityProvincePostal: "", contactPersonPhone: "", sortOrder: 0 };

function Required() {
  return <span className="text-destructive" aria-hidden="true"> *</span>;
}

export default function WarehousesPage() {
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<WarehouseInput>(EMPTY);
  const [error, setError] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<Warehouse | null>(null);

  const load = useCallback(
    () => warehouseService.getAll()
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load warehouses."))
      .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setTarget(null); setForm(EMPTY); setError(""); setOpen(true); };
  const openEdit = (row: Warehouse) => {
    setTarget(row);
    setForm({ code: row.code, name: row.name, addressLines: row.addressLines, cityProvincePostal: row.cityProvincePostal, contactPersonPhone: row.contactPersonPhone, sortOrder: row.sortOrder });
    setError("");
    setOpen(true);
  };
  const set = <K extends keyof WarehouseInput>(key: K, value: WarehouseInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const missing = [
      ["Code", form.code], ["Name", form.name], ["Address lines", form.addressLines], ["City / Province / Postal code", form.cityProvincePostal],
    ].filter(([, value]) => !String(value).trim()).map(([label]) => label);
    if (missing.length) { setError(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`); return; }
    setSaving(true);
    setError("");
    try {
      const saved = target ? await warehouseService.update(target.id, form) : await warehouseService.create(form);
      toast.success(target ? `${saved.name} saved.` : `${saved.name} created as ${saved.warehouseId}.`);
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save warehouse.");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: Warehouse, active: boolean) => {
    try {
      await warehouseService.setActive(row.id, active);
      toast.success(`${row.name} ${active ? "reactivated" : "deactivated"}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update warehouse.");
    }
  };

  const columns: ColumnDef<Warehouse>[] = [
    { accessorKey: "warehouseId", header: "ID", cell: ({ row }) => <span className="font-mono text-xs">{row.original.warehouseId}</span> },
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { accessorKey: "name", header: "Name" },
    {
      id: "address",
      header: "Address",
      accessorFn: (w) => [w.addressLines, w.cityProvincePostal].filter(Boolean).join(", "),
      cell: ({ row }) => (
        <div className="min-w-0 max-w-xs">
          <div className="truncate">{row.original.addressLines}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.cityProvincePostal}</div>
        </div>
      ),
    },
    { accessorKey: "contactPersonPhone", header: "Contact", cell: ({ row }) => row.original.contactPersonPhone || <span className="text-muted-foreground">—</span> },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => row.original.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>,
    },
    { accessorKey: "sortOrder", header: "Display order", cell: ({ row }) => <span className="tabular-nums">{row.original.sortOrder}</span> },
    {
      id: "rowActions",
      header: "Action",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" aria-label={`Edit ${row.original.name}`} onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          {row.original.active ? (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Deactivate" aria-label={`Deactivate ${row.original.name}`} onClick={(e) => { e.stopPropagation(); setDeactivateTarget(row.original); }}>
              <PowerOff className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Reactivate" aria-label={`Reactivate ${row.original.name}`} onClick={(e) => { e.stopPropagation(); void setActive(row.original, true); }}>
              <Power className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="min-w-0 p-3 sm:p-6">
        <EntityTable
          title="Warehouses"
          columns={columns}
          data={rows}
          loading={loading}
          onCreateNew={openCreate}
          getRowId={(w) => w.id}
          getRowClassName={(w) => (w.active ? "" : "opacity-60")}
          mobileLayout={{
            primary: ["code", "name", "address", "active"],
            labels: { warehouseId: "ID", code: "Code", name: "Warehouse", address: "Address", contactPersonPhone: "Contact", active: "Status", sortOrder: "Display order", rowActions: "Actions" },
          }}
        />
      </div>

      <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{target ? "Edit warehouse" : "Add warehouse"}</DialogTitle>
            <DialogDescription>
              {target
                ? <>Warehouse ID <span className="font-mono">{target.warehouseId}</span> is permanent; stock and deliveries are recorded against it.</>
                : "The Warehouse ID is assigned automatically when you save."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="wh-code">Code<Required /></Label>
                <Input id="wh-code" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. MAIN" aria-required="true" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wh-name">Name<Required /></Label>
                <Input id="wh-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Main Warehouse" aria-required="true" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-address">Address lines<Required /></Label>
              <Textarea id="wh-address" value={form.addressLines} onChange={(e) => set("addressLines", e.target.value)} rows={3} placeholder="Building, street, barangay" aria-required="true" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-city">City / Province / Postal code<Required /></Label>
              <Input id="wh-city" value={form.cityProvincePostal} onChange={(e) => set("cityProvincePostal", e.target.value)} placeholder="e.g. Quezon City, Metro Manila 1100" aria-required="true" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wh-contact">Contact person / phone</Label>
                <Input id="wh-contact" value={form.contactPersonPhone} onChange={(e) => set("contactPersonPhone", e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-order">Display order</Label>
                <Input id="wh-order" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground">Lower numbers show first in dropdowns.</p>
              </div>
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {target ? "Save changes" : "Create warehouse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(value) => { if (!value) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer appear in delivery, transfer, stock entry or purchase order pickers. Its history is kept, and you can reactivate it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deactivateTarget) void setActive(deactivateTarget, false); setDeactivateTarget(null); }}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

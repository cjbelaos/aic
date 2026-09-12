"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityTable } from "@/components/ui/entity-table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import warehouseService from "@/lib/services/warehouse.service";
import type { CreateWarehousePayload, Warehouse } from "@/types/warehouse";

const EMPTY: CreateWarehousePayload = {
  warehouseId: "", companyId: "COMP-7", code: "", name: "", addressLines: "", cityProvincePostal: "",
  contactPersonPhone: "", active: true, sortOrder: 0,
};

export default function WarehousesPage() {
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<CreateWarehousePayload>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [error, setError] = useState("");

  const load = async () => { try { setRows(await warehouseService.getAll()); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const edit = (row: Warehouse) => { setTarget(row); setForm({ warehouseId: row.warehouseId, companyId: row.companyId || "COMP-7", code: row.code, name: row.name, addressLines: row.addressLines, cityProvincePostal: row.cityProvincePostal, contactPersonPhone: row.contactPersonPhone, active: row.active, sortOrder: row.sortOrder }); setError(""); setOpen(true); };
  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.addressLines.trim() || !form.cityProvincePostal.trim()) { setError("Code, name, address lines, and city/province/postal code are required."); return; }
    setSaving(true); setError("");
    try { if (target) await warehouseService.update(target.id, form); else await warehouseService.create(form); await load(); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to save warehouse."); } finally { setSaving(false); }
  };
  const columns = [
    { accessorKey: "warehouseId", header: "Warehouse ID" }, { accessorKey: "companyId", header: "Company ID" }, { accessorKey: "code", header: "Code" }, { accessorKey: "name", header: "Name" },
    { accessorKey: "addressLines", header: "Address lines" }, { accessorKey: "cityProvincePostal", header: "City / Province / Postal code" }, { accessorKey: "contactPersonPhone", header: "Contact person / phone" },
    { accessorKey: "active", header: "Active status", cell: ({ row }: { row: { original: Warehouse } }) => row.original.active ? "Active" : "Inactive" }, { accessorKey: "sortOrder", header: "Sort order" }, { accessorKey: "updatedAt", header: "Updated" },
  ];
  const set = (key: keyof CreateWarehousePayload, value: string | boolean | number) => setForm((current) => ({ ...current, [key]: value }));
  return <>
    <div className="min-w-0 p-3 sm:p-6"><EntityTable title="Warehouses" columns={columns} data={rows} loading={loading} onCreateNew={() => { setTarget(null); setForm(EMPTY); setError(""); setOpen(true); }} onEdit={edit} onDelete={setDeleteTarget} mobileLayout={{ primary: ["code", "name", "cityProvincePostal"], labels: { code: "Code", name: "Warehouse", addressLines: "Address", cityProvincePostal: "Location", contactPersonPhone: "Contact", active: "Status", sortOrder: "Order", updatedAt: "Updated", actions: "Actions" } }} /></div>
    <Dialog open={open} onOpenChange={(value) => !saving && setOpen(value)}><DialogContent className="max-h-[92dvh] overflow-y-auto"><DialogHeader><DialogTitle>{target ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle></DialogHeader>
      <div className="grid gap-4"><div><Label>Warehouse ID (optional)</Label><Input value={form.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} placeholder="WH-1" /></div><div><Label>Code</Label><Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="MAIN" /></div><div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Main Warehouse" /></div><div><Label>Address lines</Label><Textarea value={form.addressLines} onChange={(e) => set("addressLines", e.target.value)} rows={3} /></div><div><Label>City / Province / Postal code</Label><Input value={form.cityProvincePostal} onChange={(e) => set("cityProvincePostal", e.target.value)} /></div><div><Label>Contact person / phone</Label><Input value={form.contactPersonPhone} onChange={(e) => set("contactPersonPhone", e.target.value)} /></div><div><Label>Active status</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.active ? "true" : "false"} onChange={(e) => set("active", e.target.value === "true")}><option value="true">Active</option><option value="false">Inactive</option></select></div><div><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} /></div>{error && <p className="text-sm text-destructive">{error}</p>}</div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{target ? "Save changes" : "Create warehouse"}</Button></DialogFooter>
    </DialogContent></Dialog>
    <ConfirmDeleteDialog open={!!deleteTarget} title="Delete warehouse" description={`Delete ${deleteTarget?.name ?? "this warehouse"}?`} onClose={() => setDeleteTarget(null)} onConfirm={async () => { if (deleteTarget) await warehouseService.delete(deleteTarget.id); await load(); setDeleteTarget(null); }} />
  </>;
}

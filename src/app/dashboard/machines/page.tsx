// "use client";

// import { useEffect, useState } from "react";
// import { ColumnDef } from "@tanstack/react-table";
// import { ArrowUpDown, Loader2 } from "lucide-react";
// import { toast } from "sonner";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { EntityTable } from "@/components/ui/entity-table";
// import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
// import {
//   Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
// } from "@/components/ui/dialog";
// import machineService from "@/lib/services/machine.service";
// import { Machine, MachineDto } from "@/types/api/machine/machine";

// function exportToCsv(rows: Machine[]) {
//   const header = "Machine Name,Model,Serial Number";
//   const body = rows.map((r) => [r.machineName, r.model, r.serialNumber].join(","));
//   const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
//   const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "machines.csv"; a.click();
// }

// const EMPTY: MachineDto = { machineName: "", model: "", serialNumber: "" };

// const columns: ColumnDef<Machine>[] = [
//   {
//     accessorKey: "machineName",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Machine Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//     cell: ({ row }) => <span className="text-blue-600 font-medium">{row.original.machineName}</span>,
//   },
//   {
//     accessorKey: "model",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Model <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
//   {
//     accessorKey: "serialNumber",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Serial Number <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
// ];

// export default function MachinesPage() {
//   const [data, setData] = useState<Machine[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");
//   const [modalOpen, setModalOpen] = useState(false);
//   const [editTarget, setEditTarget] = useState<Machine | null>(null);
//   const [form, setForm] = useState<MachineDto>(EMPTY);
//   const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);

//   useEffect(() => {
//     machineService.getAll()
//       .then((r) => { if (r.isSuccess) setData(r.result); })
//       .catch(() => toast.error("Failed to load machines."))
//       .finally(() => setLoading(false));
//   }, []);

//   const openCreate = () => { setEditTarget(null); setForm(EMPTY); setError(""); setModalOpen(true); };
//   const openEdit = (row: Machine) => {
//     setEditTarget(row);
//     setForm({ machineName: row.machineName, model: row.model, serialNumber: row.serialNumber });
//     setError(""); setModalOpen(true);
//   };

//   const handleSave = async () => {
//     if (!form.machineName.trim()) { setError("Machine name is required."); return; }
//     if (!form.model.trim()) { setError("Model is required."); return; }
//     if (!form.serialNumber.trim()) { setError("Serial number is required."); return; }
//     setSaving(true); setError("");
//     try {
//       if (editTarget) {
//         const res = await machineService.update(editTarget.id, form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         setData((prev) => prev.map((m) => m.id === editTarget.id ? { ...m, ...form } : m));
//         toast.success("Machine updated successfully.");
//       } else {
//         const res = await machineService.create(form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         setData((prev) => [...prev, res.result]);
//         toast.success("Machine created successfully.");
//       }
//       setModalOpen(false);
//     } catch { setError("Server error. Please try again."); }
//     finally { setSaving(false); }
//   };

//   const handleDelete = async () => {
//     if (!deleteTarget) return;
//     const res = await machineService.delete(deleteTarget.id);
//     if (!res.isSuccess) throw new Error(res.errorMessages?.join(" ") || "Delete failed.");
//     setData((prev) => prev.filter((m) => m.id !== deleteTarget.id));
//     setDeleteTarget(null);
//     toast.success(`"${deleteTarget.machineName}" deleted successfully.`);
//   };

//   return (
//     <>
//       <EntityTable title="Machine List" columns={columns} data={data} loading={loading}
//         onCreateNew={openCreate} onEdit={openEdit} onDelete={(row) => setDeleteTarget(row)}
//         onExport={exportToCsv} onImport={(file) => alert(`Import: ${file.name}`)} />

//       <Dialog open={modalOpen} onOpenChange={(v) => { if (!saving) setModalOpen(v); }}>
//         <DialogContent className="sm:max-w-sm">
//           <DialogHeader>
//             <DialogTitle>{editTarget ? "Edit Machine" : "Create Machine"}</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4 py-2">
//             {error && <p className="text-sm text-destructive">{error}</p>}
//             <div className="space-y-1.5">
//               <Label htmlFor="m-name">Machine Name *</Label>
//               <Input id="m-name" value={form.machineName} disabled={saving}
//                 onChange={(e) => setForm((f) => ({ ...f, machineName: e.target.value }))} />
//             </div>
//             <div className="space-y-1.5">
//               <Label htmlFor="m-model">Model *</Label>
//               <Input id="m-model" value={form.model} disabled={saving}
//                 onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
//             </div>
//             <div className="space-y-1.5">
//               <Label htmlFor="m-serial">Serial Number *</Label>
//               <Input id="m-serial" value={form.serialNumber} disabled={saving}
//                 onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
//             </div>
//           </div>
//           <DialogFooter>
//             <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
//             <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
//               {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
//               {editTarget ? "Update" : "Create"}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>

//       <ConfirmDeleteDialog open={!!deleteTarget}
//         description={`Delete machine "${deleteTarget?.machineName}"? This cannot be undone.`}
//         onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
//     </>
//   );
// }

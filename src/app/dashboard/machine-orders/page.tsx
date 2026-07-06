// "use client";

// import { useEffect, useState } from "react";
// import { ColumnDef } from "@tanstack/react-table";
// import { ArrowUpDown, Loader2, Plus, Trash2 } from "lucide-react";
// import { toast } from "sonner";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { EntityTable } from "@/components/ui/entity-table";
// import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
// import {
//   Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
// } from "@/components/ui/dialog";
// import {
//   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
// } from "@/components/ui/select";
// import machineOrderService from "@/lib/services/machine-order.service";
// import customerService from "@/lib/services/customer.service";
// import machineService from "@/lib/services/machine.service";
// import {
//   MachineOrderDto, MachineOrder, MachineOrderDetailDto,
// } from "@/types/api/machine-order/machine-order";
// import { Customer } from "@/types/api/customer/customer";
// import { Machine } from "@/types/api/machine/machine";

// function exportToCsv(rows: MachineOrder[]) {
//   const header = "Order Number,Order Date,Customer,Machines";
//   const body = rows.map((r) => [
//     r.orderNumber, new Date(r.orderDate).toLocaleDateString(),
//     r.customer?.customerName ?? "", r.machineOrderDetails?.length ?? 0,
//   ].join(","));
//   const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
//   const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "machine-orders.csv"; a.click();
// }

// const EMPTY_DETAIL: MachineOrderDetailDto = { machineId: 0, quantity: 1 };
// const emptyForm = (): MachineOrderDto => ({
//   orderNumber: "", customerId: 0,
//   orderDate: new Date().toISOString().slice(0, 10),
//   machineOrderDetailsDto: [{ ...EMPTY_DETAIL }],
// });

// const columns: ColumnDef<MachineOrder>[] = [
//   {
//     accessorKey: "orderNumber",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Order Number <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//     cell: ({ row }) => <span className="text-blue-600 font-medium">{row.original.orderNumber}</span>,
//   },
//   {
//     accessorKey: "orderDate",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Order Date <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//     cell: ({ row }) => new Date(row.original.orderDate).toLocaleDateString(),
//   },
//   {
//     id: "customerName",
//     accessorFn: (row) => row.customer?.customerName ?? "",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Customer <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
//   {
//     id: "machineCount",
//     accessorFn: (row) => row.machineOrderDetails?.length ?? 0,
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Machines <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
// ];

// export default function MachineOrdersPage() {
//   const [data, setData] = useState<MachineOrder[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");
//   const [modalOpen, setModalOpen] = useState(false);
//   const [editTarget, setEditTarget] = useState<MachineOrder | null>(null);
//   const [form, setForm] = useState<MachineOrderDto>(emptyForm());
//   const [deleteTarget, setDeleteTarget] = useState<MachineOrder | null>(null);
//   const [customers, setCustomers] = useState<Customer[]>([]);
//   const [machines, setMachines] = useState<Machine[]>([]);

//   useEffect(() => {
//     machineOrderService.getAll()
//       .then((r) => { if (r.isSuccess) setData(r.result); })
//       .catch(() => toast.error("Failed to load machine orders."))
//       .finally(() => setLoading(false));
//     customerService.getAll().then((r) => { if (r.isSuccess) setCustomers(r.result); });
//     machineService.getAll().then((r) => { if (r.isSuccess) setMachines(r.result); });
//   }, []);

//   const openCreate = async () => {
//     const numRes = await machineOrderService.getOrderNumber();
//     const f = emptyForm();
//     if (numRes.isSuccess) f.orderNumber = numRes.result;
//     setEditTarget(null); setForm(f); setError(""); setModalOpen(true);
//   };
//   const openEdit = (row: MachineOrder) => {
//     setEditTarget(row);
//     setForm({
//       orderNumber: row.orderNumber, customerId: row.customer?.id ?? 0,
//       orderDate: row.orderDate.slice(0, 10),
//       machineOrderDetailsDto: row.machineOrderDetails.map((d) => ({
//         machineId: d.machine?.id ?? 0, quantity: d.quantity,
//       })),
//     });
//     setError(""); setModalOpen(true);
//   };

//   const setDetail = (idx: number, patch: Partial<MachineOrderDetailDto>) =>
//     setForm((f) => ({ ...f, machineOrderDetailsDto: f.machineOrderDetailsDto.map((d, i) => i === idx ? { ...d, ...patch } : d) }));
//   const addDetail = () => setForm((f) => ({ ...f, machineOrderDetailsDto: [...f.machineOrderDetailsDto, { ...EMPTY_DETAIL }] }));
//   const removeDetail = (idx: number) => setForm((f) => ({ ...f, machineOrderDetailsDto: f.machineOrderDetailsDto.filter((_, i) => i !== idx) }));

//   const handleSave = async () => {
//     if (!form.orderNumber.trim()) { setError("Order number is required."); return; }
//     if (!form.customerId) { setError("Please select a customer."); return; }
//     if (form.machineOrderDetailsDto.some((d) => !d.machineId)) { setError("All line items require a machine."); return; }
//     setSaving(true); setError("");
//     try {
//       if (editTarget) {
//         const res = await machineOrderService.update(editTarget.id, form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         const fresh = await machineOrderService.getAll();
//         if (fresh.isSuccess) setData(fresh.result);
//         toast.success("Machine order updated successfully.");
//       } else {
//         const res = await machineOrderService.create(form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         setData((prev) => [...prev, res.result]);
//         toast.success("Machine order created successfully.");
//       }
//       setModalOpen(false);
//     } catch { setError("Server error. Please try again."); }
//     finally { setSaving(false); }
//   };

//   const handleDelete = async () => {
//     if (!deleteTarget) return;
//     const res = await machineOrderService.delete(deleteTarget.id);
//     if (!res.isSuccess) throw new Error(res.errorMessages?.join(" ") || "Delete failed.");
//     setData((prev) => prev.filter((m) => m.id !== deleteTarget.id));
//     setDeleteTarget(null);
//     toast.success(`Machine order "${deleteTarget.orderNumber}" deleted successfully.`);
//   };

//   return (
//     <>
//       <EntityTable title="Machine Order List" columns={columns} data={data} loading={loading}
//         onCreateNew={openCreate} onEdit={openEdit} onDelete={(row) => setDeleteTarget(row)}
//         onExport={exportToCsv} onImport={(file) => alert(`Import: ${file.name}`)} />

//       <Dialog open={modalOpen} onOpenChange={(v) => { if (!saving) setModalOpen(v); }}>
//         <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>{editTarget ? "Edit Machine Order" : "Create Machine Order"}</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4 py-2">
//             {error && <p className="text-sm text-destructive">{error}</p>}
//             <div className="grid grid-cols-2 gap-3">
//               <div className="space-y-1.5">
//                 <Label htmlFor="mo-num">Order Number *</Label>
//                 <Input id="mo-num" value={form.orderNumber} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))} />
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="mo-date">Order Date *</Label>
//                 <Input id="mo-date" type="date" value={form.orderDate} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} />
//               </div>
//             </div>
//             <div className="space-y-1.5">
//               <Label>Customer *</Label>
//               <Select value={String(form.customerId || "")} onValueChange={(v) => setForm((f) => ({ ...f, customerId: Number(v) }))}>
//                 <SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger>
//                 <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.customerName}</SelectItem>)}</SelectContent>
//               </Select>
//             </div>
//             <div className="space-y-2">
//               <div className="flex items-center justify-between">
//                 <Label>Machines</Label>
//                 <Button type="button" variant="outline" size="sm" onClick={addDetail} disabled={saving}>
//                   <Plus className="mr-1 h-3.5 w-3.5" /> Add Machine
//                 </Button>
//               </div>
//               {form.machineOrderDetailsDto.map((d, i) => (
//                 <div key={i} className="grid grid-cols-[1fr_80px_36px] gap-2 items-end">
//                   <div className="space-y-1">
//                     <Label className="text-xs">Machine</Label>
//                     <Select value={String(d.machineId || "")} onValueChange={(v) => setDetail(i, { machineId: Number(v) })}>
//                       <SelectTrigger className="h-8"><SelectValue placeholder="Select machine" /></SelectTrigger>
//                       <SelectContent>{machines.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.machineName} — {m.model}</SelectItem>)}</SelectContent>
//                     </Select>
//                   </div>
//                   <div className="space-y-1">
//                     <Label className="text-xs">Qty</Label>
//                     <Input className="h-8" type="number" min={1} value={d.quantity} disabled={saving}
//                       onChange={(e) => setDetail(i, { quantity: parseInt(e.target.value) || 1 })} />
//                   </div>
//                   <Button type="button" variant="ghost" size="icon" className="h-8 w-8 self-end text-destructive"
//                     onClick={() => removeDetail(i)} disabled={saving || form.machineOrderDetailsDto.length <= 1}>
//                     <Trash2 className="h-4 w-4" />
//                   </Button>
//                 </div>
//               ))}
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
//         description={`Delete machine order "${deleteTarget?.orderNumber}"? This cannot be undone.`}
//         onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
//     </>
//   );
// }

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
// import salesOrderService from "@/lib/services/sales-order.service";
// import productService from "@/lib/services/products.service";
// import {
//   SalesOrderDto, SalesOrder, SalesOrderDetailDto,
// } from "@/types/api/sales-order/sales-order";
// import { Product } from "@/types/api/product/product";

// const REVENUE_CHANNELS = [
//   { value: "1", label: "Delivery" },
//   { value: "2", label: "PMS" },
//   { value: "3", label: "CompleteStocksForSchedule" },
//   { value: "4", label: "Repack" },
//   { value: "5", label: "Installation" },
// ];

// function exportToCsv(rows: SalesOrder[]) {
//   const header = "Order Number,Ship Out Date,Revenue Channel,Items,Notes";
//   const body = rows.map((r) => [
//     r.orderNumber, new Date(r.shipOutDate).toLocaleDateString(),
//     r.revenueChannel, r.salesOrderDetails?.length ?? 0, r.notes ?? "",
//   ].join(","));
//   const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
//   const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sales-orders.csv"; a.click();
// }

// const EMPTY_DETAIL: SalesOrderDetailDto = { productId: 0, quantity: 1, unitPrice: 0 };
// const emptyForm = (): SalesOrderDto => ({
//   orderNumber: "", shipOutDate: new Date().toISOString().slice(0, 10),
//   revenueChannel: 1, notes: "", salesOrderDetailsDto: [{ ...EMPTY_DETAIL }],
// });

// const columns: ColumnDef<SalesOrder>[] = [
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
//     accessorKey: "shipOutDate",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Ship Out Date <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//     cell: ({ row }) => new Date(row.original.shipOutDate).toLocaleDateString(),
//   },
//   {
//     accessorKey: "revenueChannel",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Revenue Channel <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
//   {
//     id: "itemCount",
//     accessorFn: (row) => row.salesOrderDetails?.length ?? 0,
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Items <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
//   { accessorKey: "notes", header: "Notes", cell: ({ row }) => row.original.notes ?? "—" },
// ];

// export default function SalesOrdersPage() {
//   const [data, setData] = useState<SalesOrder[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");
//   const [modalOpen, setModalOpen] = useState(false);
//   const [editTarget, setEditTarget] = useState<SalesOrder | null>(null);
//   const [form, setForm] = useState<SalesOrderDto>(emptyForm());
//   const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
//   const [products, setProducts] = useState<Product[]>([]);

//   useEffect(() => {
//     salesOrderService.getAll()
//       .then((r) => { if (r.isSuccess) setData(r.result); })
//       .catch(() => toast.error("Failed to load sales orders."))
//       .finally(() => setLoading(false));
//     productService.getAll().then((r) => { if (r.isSuccess) setProducts(r.result); });
//   }, []);

//   const openCreate = async () => {
//     const numRes = await salesOrderService.getSalesOrderNumber();
//     const f = emptyForm();
//     if (numRes.isSuccess) f.orderNumber = numRes.result;
//     setEditTarget(null); setForm(f); setError(""); setModalOpen(true);
//   };
//   const openEdit = (row: SalesOrder) => {
//     setEditTarget(row);
//     setForm({
//       orderNumber: row.orderNumber, shipOutDate: row.shipOutDate.slice(0, 10),
//       revenueChannel: REVENUE_CHANNELS.findIndex((c) => c.label === row.revenueChannel) + 1 || 1,
//       notes: row.notes ?? "",
//       salesOrderDetailsDto: row.salesOrderDetails.map((d) => ({
//         productId: d.product?.id ?? 0, quantity: d.quantity, unitPrice: d.product?.pricePerUnit ?? 0,
//       })),
//     });
//     setError(""); setModalOpen(true);
//   };

//   const setDetail = (idx: number, patch: Partial<SalesOrderDetailDto>) =>
//     setForm((f) => ({ ...f, salesOrderDetailsDto: f.salesOrderDetailsDto.map((d, i) => i === idx ? { ...d, ...patch } : d) }));
//   const addDetail = () => setForm((f) => ({ ...f, salesOrderDetailsDto: [...f.salesOrderDetailsDto, { ...EMPTY_DETAIL }] }));
//   const removeDetail = (idx: number) => setForm((f) => ({ ...f, salesOrderDetailsDto: f.salesOrderDetailsDto.filter((_, i) => i !== idx) }));

//   const handleSave = async () => {
//     if (!form.orderNumber.trim()) { setError("Order number is required."); return; }
//     if (form.salesOrderDetailsDto.some((d) => !d.productId)) { setError("All line items require a product."); return; }
//     setSaving(true); setError("");
//     try {
//       if (editTarget) {
//         const res = await salesOrderService.update(editTarget.id, form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         const fresh = await salesOrderService.getAll();
//         if (fresh.isSuccess) setData(fresh.result);
//         toast.success("Sales order updated successfully.");
//       } else {
//         const res = await salesOrderService.create(form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         setData((prev) => [...prev, res.result]);
//         toast.success("Sales order created successfully.");
//       }
//       setModalOpen(false);
//     } catch { setError("Server error. Please try again."); }
//     finally { setSaving(false); }
//   };

//   const handleDelete = async () => {
//     if (!deleteTarget) return;
//     const res = await salesOrderService.delete(deleteTarget.id);
//     if (!res.isSuccess) throw new Error(res.errorMessages?.join(" ") || "Delete failed.");
//     setData((prev) => prev.filter((s) => s.id !== deleteTarget.id));
//     setDeleteTarget(null);
//     toast.success(`Sales order "${deleteTarget.orderNumber}" deleted successfully.`);
//   };

//   return (
//     <>
//       <EntityTable title="Sales Order List" columns={columns} data={data} loading={loading}
//         onCreateNew={openCreate} onEdit={openEdit} onDelete={(row) => setDeleteTarget(row)}
//         onExport={exportToCsv} onImport={(file) => alert(`Import: ${file.name}`)} />

//       <Dialog open={modalOpen} onOpenChange={(v) => { if (!saving) setModalOpen(v); }}>
//         <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>{editTarget ? "Edit Sales Order" : "Create Sales Order"}</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4 py-2">
//             {error && <p className="text-sm text-destructive">{error}</p>}
//             <div className="grid grid-cols-2 gap-3">
//               <div className="space-y-1.5">
//                 <Label htmlFor="so-num">Order Number *</Label>
//                 <Input id="so-num" value={form.orderNumber} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))} />
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="so-ship">Ship Out Date *</Label>
//                 <Input id="so-ship" type="date" value={form.shipOutDate} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, shipOutDate: e.target.value }))} />
//               </div>
//             </div>
//             <div className="grid grid-cols-2 gap-3">
//               <div className="space-y-1.5">
//                 <Label>Revenue Channel *</Label>
//                 <Select value={String(form.revenueChannel)} onValueChange={(v) => setForm((f) => ({ ...f, revenueChannel: Number(v) }))}>
//                   <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
//                   <SelectContent>{REVENUE_CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
//                 </Select>
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="so-notes">Notes</Label>
//                 <Input id="so-notes" value={form.notes ?? ""} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
//               </div>
//             </div>
//             <div className="space-y-2">
//               <div className="flex items-center justify-between">
//                 <Label>Line Items</Label>
//                 <Button type="button" variant="outline" size="sm" onClick={addDetail} disabled={saving}>
//                   <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
//                 </Button>
//               </div>
//               {form.salesOrderDetailsDto.map((d, i) => (
//                 <div key={i} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 items-end">
//                   <div className="space-y-1">
//                     <Label className="text-xs">Product</Label>
//                     <Select value={String(d.productId || "")}
//                       onValueChange={(v) => setDetail(i, { productId: Number(v), unitPrice: products.find((p) => p.id === Number(v))?.pricePerUnit ?? 0 })}>
//                       <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
//                       <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.productName}</SelectItem>)}</SelectContent>
//                     </Select>
//                   </div>
//                   <div className="space-y-1">
//                     <Label className="text-xs">Qty</Label>
//                     <Input className="h-8" type="number" min={1} value={d.quantity} disabled={saving}
//                       onChange={(e) => setDetail(i, { quantity: parseInt(e.target.value) || 1 })} />
//                   </div>
//                   <div className="space-y-1">
//                     <Label className="text-xs">Unit Price</Label>
//                     <Input className="h-8" type="number" min={0} step="0.01" value={d.unitPrice} disabled={saving}
//                       onChange={(e) => setDetail(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
//                   </div>
//                   <Button type="button" variant="ghost" size="icon" className="h-8 w-8 self-end text-destructive"
//                     onClick={() => removeDetail(i)} disabled={saving || form.salesOrderDetailsDto.length <= 1}>
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
//         description={`Delete sales order "${deleteTarget?.orderNumber}"? This cannot be undone.`}
//         onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
//     </>
//   );
// }

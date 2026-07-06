// "use client";

// import { useEffect, useState } from "react";
// import { ColumnDef } from "@tanstack/react-table";
// import { ArrowUpDown, Loader2, Plus, Trash2 } from "lucide-react";
// import { toast } from "sonner";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Badge } from "@/components/ui/badge";
// import { EntityTable } from "@/components/ui/entity-table";
// import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
// import {
//   Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
// } from "@/components/ui/dialog";
// import {
//   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
// } from "@/components/ui/select";
// import purchaseOrderService from "@/lib/services/purchase-order.service";
// import supplierService from "@/lib/services/supplier.service";
// import productService from "@/lib/services/products.service";
// import {
//   PurchaseOrderRequest, PurchaseOrderResponse, PurchaseOrderDetailRequest,
// } from "@/types/api/purchase-order";
// import { Supplier } from "@/types/api/supplier/supplier";
// import { Product } from "@/types/api/product/product";

// const DELIVERY_STATUSES = [
//   { value: "1", label: "Ordered" },
//   { value: "2", label: "Delivered" },
//   { value: "3", label: "Cancelled" },
// ];

// function exportToCsv(rows: PurchaseOrderResponse[]) {
//   const header = "Order Number,Order Date,Supplier,Status,Delivery Date,Days To Deliver";
//   const body = rows.map((r) => [
//     r.orderNumber, new Date(r.orderDate).toLocaleDateString(),
//     r.supplier?.supplierName ?? "", r.deliveryStatus,
//     r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString() : "",
//     r.daysToDeliver ?? "",
//   ].join(","));
//   const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
//   const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "purchase-orders.csv"; a.click();
// }

// const EMPTY_DETAIL: PurchaseOrderDetailRequest = { productId: 0, quantity: 1, costPerUnit: 0 };
// const emptyForm = (): PurchaseOrderRequest => ({
//   orderDate: new Date().toISOString().slice(0, 10),
//   deliveryDate: undefined, supplierId: 0, deliveryStatus: 1,
//   daysToDeliver: undefined, notes: "",
//   purchaseOrderDetailRequest: [{ ...EMPTY_DETAIL }],
// });

// const columns: ColumnDef<PurchaseOrderResponse>[] = [
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
//     id: "supplierName",
//     accessorFn: (row) => row.supplier?.supplierName ?? "",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Supplier <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//   },
//   {
//     accessorKey: "deliveryStatus",
//     header: ({ column }) => (
//       <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
//         Status <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
//       </Button>
//     ),
//     cell: ({ row }) => <Badge variant="secondary">{row.original.deliveryStatus}</Badge>,
//   },
//   {
//     accessorKey: "deliveryDate",
//     header: "Delivery Date",
//     cell: ({ row }) => row.original.deliveryDate ? new Date(row.original.deliveryDate).toLocaleDateString() : "—",
//   },
//   {
//     accessorKey: "daysToDeliver",
//     header: "Days",
//     cell: ({ row }) => row.original.daysToDeliver ?? "—",
//   },
// ];

// export default function PurchaseOrdersPage() {
//   const [data, setData] = useState<PurchaseOrderResponse[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");
//   const [modalOpen, setModalOpen] = useState(false);
//   const [editTarget, setEditTarget] = useState<PurchaseOrderResponse | null>(null);
//   const [form, setForm] = useState<PurchaseOrderRequest>(emptyForm());
//   const [deleteTarget, setDeleteTarget] = useState<PurchaseOrderResponse | null>(null);
//   const [suppliers, setSuppliers] = useState<Supplier[]>([]);
//   const [products, setProducts] = useState<Product[]>([]);

//   useEffect(() => {
//     purchaseOrderService.getAll()
//       .then((r) => { if (r.isSuccess) setData(r.result); })
//       .catch(() => toast.error("Failed to load purchase orders."))
//       .finally(() => setLoading(false));
//     supplierService.getAll().then((r) => { if (r.isSuccess) setSuppliers(r.result); });
//     productService.getAll().then((r) => { if (r.isSuccess) setProducts(r.result); });
//   }, []);

//   const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setError(""); setModalOpen(true); };
//   const openEdit = (row: PurchaseOrderResponse) => {
//     setEditTarget(row);
//     setForm({
//       orderDate: row.orderDate.slice(0, 10),
//       deliveryDate: row.deliveryDate ? row.deliveryDate.slice(0, 10) : undefined,
//       supplierId: row.supplier?.id ?? 0,
//       deliveryStatus: DELIVERY_STATUSES.findIndex((s) => s.label === row.deliveryStatus) + 1 || 1,
//       daysToDeliver: row.daysToDeliver,
//       notes: row.notes ?? "",
//       purchaseOrderDetailRequest: row.purchaseOrderDetails.map((d) => ({
//         productId: d.product?.id ?? 0, quantity: d.quantity, costPerUnit: d.product?.costPerUnit ?? 0,
//       })),
//     });
//     setError(""); setModalOpen(true);
//   };

//   const setDetail = (idx: number, patch: Partial<PurchaseOrderDetailRequest>) =>
//     setForm((f) => ({ ...f, purchaseOrderDetailRequest: f.purchaseOrderDetailRequest.map((d, i) => i === idx ? { ...d, ...patch } : d) }));
//   const addDetail = () => setForm((f) => ({ ...f, purchaseOrderDetailRequest: [...f.purchaseOrderDetailRequest, { ...EMPTY_DETAIL }] }));
//   const removeDetail = (idx: number) => setForm((f) => ({ ...f, purchaseOrderDetailRequest: f.purchaseOrderDetailRequest.filter((_, i) => i !== idx) }));

//   const handleSave = async () => {
//     if (!form.supplierId) { setError("Please select a supplier."); return; }
//     if (form.purchaseOrderDetailRequest.some((d) => !d.productId)) { setError("All line items require a product."); return; }
//     setSaving(true); setError("");
//     try {
//       if (editTarget) {
//         const res = await purchaseOrderService.update(editTarget.id, form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         // Re-fetch this order to get full supplier/product objects
//         const fresh = await purchaseOrderService.getAll();
//         if (fresh.isSuccess) setData(fresh.result);
//         toast.success("Purchase order updated successfully.");
//       } else {
//         const res = await purchaseOrderService.create(form);
//         if (!res.isSuccess) { setError(res.errorMessages?.join(" ") || "Save failed."); return; }
//         setData((prev) => [...prev, res.result]);
//         toast.success("Purchase order created successfully.");
//       }
//       setModalOpen(false);
//     } catch { setError("Server error. Please try again."); }
//     finally { setSaving(false); }
//   };

//   const handleDelete = async () => {
//     if (!deleteTarget) return;
//     const res = await purchaseOrderService.delete(deleteTarget.id);
//     if (!res.isSuccess) throw new Error(res.errorMessages?.join(" ") || "Delete failed.");
//     setData((prev) => prev.filter((p) => p.id !== deleteTarget.id));
//     setDeleteTarget(null);
//     toast.success(`Purchase order "${deleteTarget.orderNumber}" deleted successfully.`);
//   };

//   return (
//     <>
//       <EntityTable title="Purchase Order List" columns={columns} data={data} loading={loading}
//         onCreateNew={openCreate} onEdit={openEdit} onDelete={(row) => setDeleteTarget(row)}
//         onExport={exportToCsv} onImport={(file) => alert(`Import: ${file.name}`)} />

//       <Dialog open={modalOpen} onOpenChange={(v) => { if (!saving) setModalOpen(v); }}>
//         <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>{editTarget ? "Edit Purchase Order" : "Create Purchase Order"}</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4 py-2">
//             {error && <p className="text-sm text-destructive">{error}</p>}
//             <div className="grid grid-cols-2 gap-3">
//               <div className="space-y-1.5">
//                 <Label htmlFor="po-date">Order Date *</Label>
//                 <Input id="po-date" type="date" value={form.orderDate} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} />
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="po-delivery">Delivery Date</Label>
//                 <Input id="po-delivery" type="date" value={form.deliveryDate ?? ""} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value || undefined }))} />
//               </div>
//             </div>
//             <div className="grid grid-cols-2 gap-3">
//               <div className="space-y-1.5">
//                 <Label>Supplier *</Label>
//                 <Select value={String(form.supplierId || "")} onValueChange={(v) => setForm((f) => ({ ...f, supplierId: Number(v) }))}>
//                   <SelectTrigger className="w-full"><SelectValue placeholder="Select supplier" /></SelectTrigger>
//                   <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>)}</SelectContent>
//                 </Select>
//               </div>
//               <div className="space-y-1.5">
//                 <Label>Delivery Status *</Label>
//                 <Select value={String(form.deliveryStatus)} onValueChange={(v) => setForm((f) => ({ ...f, deliveryStatus: Number(v) }))}>
//                   <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
//                   <SelectContent>{DELIVERY_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
//                 </Select>
//               </div>
//             </div>
//             <div className="grid grid-cols-2 gap-3">
//               <div className="space-y-1.5">
//                 <Label htmlFor="po-days">Days To Deliver</Label>
//                 <Input id="po-days" type="number" min={0} value={form.daysToDeliver ?? ""} disabled={saving}
//                   onChange={(e) => setForm((f) => ({ ...f, daysToDeliver: e.target.value ? Number(e.target.value) : undefined }))} />
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="po-notes">Notes</Label>
//                 <Input id="po-notes" value={form.notes ?? ""} disabled={saving}
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
//               {form.purchaseOrderDetailRequest.map((d, i) => (
//                 <div key={i} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 items-end">
//                   <div className="space-y-1">
//                     <Label className="text-xs">Product</Label>
//                     <Select value={String(d.productId || "")}
//                       onValueChange={(v) => setDetail(i, { productId: Number(v), costPerUnit: products.find((p) => p.id === Number(v))?.costPerUnit ?? 0 })}>
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
//                     <Label className="text-xs">Cost/Unit</Label>
//                     <Input className="h-8" type="number" min={0} step="0.01" value={d.costPerUnit} disabled={saving}
//                       onChange={(e) => setDetail(i, { costPerUnit: parseFloat(e.target.value) || 0 })} />
//                   </div>
//                   <Button type="button" variant="ghost" size="icon" className="h-8 w-8 self-end text-destructive"
//                     onClick={() => removeDetail(i)} disabled={saving || form.purchaseOrderDetailRequest.length <= 1}>
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
//         description={`Delete purchase order "${deleteTarget?.orderNumber}"? This cannot be undone.`}
//         onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
//     </>
//   );
// }

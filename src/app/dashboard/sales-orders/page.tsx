"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Eye, FileText, Loader2, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityTable, ArrowUpDown } from "@/components/ui/entity-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import salesOrderService, { type OrderRowView, type SalesOrderDetail } from "@/lib/services/sales-order.service";
import { money, formatDate, orderStatusBadge, fulfillmentBadge } from "@/components/sales-orders/badges";
import { DocumentRegisterHeader } from "@/components/document-register-header";
import { matchesDocumentSearch } from "@/lib/document-register";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const ORDER_STATUSES = ["DRAFT", "CONFIRMED", "ON_HOLD", "CANCELLED", "CLOSED"];
const ORDER_CATEGORIES = ["Consumables", "Service", "Project", "Parts", "Supplies", "Treatment Package", "PMS", "Uncategorized"];

export default function SalesOrdersPage(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "services" ? "services" : "all";
  const [rows, setRows] = React.useState<OrderRowView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [error, setError] = React.useState("");
  const [preview, setPreview] = React.useState<{ orderNo: string; url: string; fileId: string } | null>(null);
  const [items, setItems] = React.useState<SalesOrderDetail | null>(null);
  const [loadingActionId, setLoadingActionId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<OrderRowView | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const filters = {
        pageSize: 1000,
        view,
        category: category === "all" ? undefined : category,
      };
      const result = await salesOrderService.list({ ...filters, page: 1 });
      const pageCount = Math.ceil(result.total / result.pageSize);
      const remaining = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => salesOrderService.list({ ...filters, page: index + 2 })));
      setRows([...result.rows, ...remaining.flatMap(page => page.rows)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load sales orders.");
    } finally {
      setLoading(false);
    }
  }, [category, view]);

  React.useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const openItems = React.useCallback(async (row: OrderRowView) => {
    setLoadingActionId(row.order.salesOrderId);
    try {
      const detail = await salesOrderService.get(row.order.salesOrderId);
      setItems(detail);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to load the Sales Order.");
    } finally { setLoadingActionId(null); }
  }, []);

  const resolvePdf = React.useCallback(async (row: OrderRowView) => {
    const detail = await salesOrderService.get(row.order.salesOrderId);
    const existing = [...detail.documents].reverse().find((document) =>
      document.documentType === "SALES_ORDER_PDF" &&
      document.orderVersion === detail.order.version &&
      document.generationStatus === "READY" &&
      document.externalUrl,
    );
    const document = existing ?? (await salesOrderService.generatePdf(row.order.salesOrderId)).document;
    if (!document?.externalUrl || !document.driveFileId) throw new Error("The Sales Order PDF could not be opened.");
    return document;
  }, []);

  const openPreview = React.useCallback(async (row: OrderRowView) => {
    setLoadingActionId(row.order.salesOrderId);
    try {
      const document = await resolvePdf(row);
      setPreview({ orderNo: row.order.salesOrderNo, url: document.externalUrl, fileId: document.driveFileId });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to load the Sales Order preview.");
    } finally { setLoadingActionId(null); }
  }, [resolvePdf]);

  const openPdf = React.useCallback(async (row: OrderRowView) => {
    // Open during the click event so the browser does not block the new tab
    // while the PDF is being fetched or generated.
    const tab = window.open("", "_blank");
    if (!tab) { toast.error("Allow popups to view the Sales Order PDF."); return; }
    setLoadingActionId(row.order.salesOrderId);
    try {
      const document = await resolvePdf(row);
      tab.location.replace(document.externalUrl);
    } catch (caught) {
      tab.close();
      toast.error(caught instanceof Error ? caught.message : "Failed to open the Sales Order PDF.");
    } finally { setLoadingActionId(null); }
  }, [resolvePdf]);

  const columns = React.useMemo<ColumnDef<OrderRowView>[]>(() => [
    {
      id: "salesOrderNo",
      accessorFn: (row) => row.order.salesOrderNo || (row.order.orderStatus === "DRAFT" ? "Draft" : "Number pending"),
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Sales Order No.<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ row }) => <div><span className="font-semibold tabular-nums">{row.original.order.salesOrderNo || (row.original.order.orderStatus === "DRAFT" ? "Draft" : "Number pending")}</span>{row.original.order.legacyTrackerNo ? <span className="block text-xs text-muted-foreground">Legacy #{row.original.order.legacyTrackerNo}</span> : null}</div>,
    },
    { id: "receivedDate", accessorFn: (row) => row.order.receivedDate, header: "Received", cell: ({ row }) => formatDate(row.original.order.receivedDate) },
    { id: "customer", accessorFn: (row) => row.order.customerNameSnapshot || row.order.customerId, header: "Customer", cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span> },
    { id: "customerPO", accessorFn: (row) => row.order.customerPONo, header: "Customer PO", cell: ({ getValue }) => String(getValue() || "—") },
    { accessorKey: "category", header: "Category", cell: ({ getValue }) => String(getValue() || "—") },
    {
      id: "total",
      accessorFn: (row) => row.order.grandTotal,
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Total<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ getValue }) => <span className="block text-right font-medium tabular-nums">{money(Number(getValue()))}</span>,
    },
    { id: "status", accessorFn: (row) => row.order.orderStatus, header: "Status", cell: ({ row }) => orderStatusBadge(row.original.order.orderStatus) },
    { id: "fulfillment", accessorFn: (row) => row.order.fulfillmentStatus, header: "Fulfillment", cell: ({ row }) => <div className="space-y-1">{fulfillmentBadge(row.original.order.fulfillmentStatus)}<span className="block text-xs text-muted-foreground">{row.original.fulfillmentPercent}%</span></div> },
    { id: "actions", header: "Actions", enableSorting: false, cell: ({ row }) => {
      const order = row.original;
      const draft = order.order.orderStatus === "DRAFT";
      const busy = loadingActionId === order.order.salesOrderId;
      return <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
        <Button variant="ghost" size="icon" title={draft ? "Confirm the order to preview its PDF" : "Preview"} aria-label="Preview Sales Order PDF" disabled={busy || draft} onClick={() => void openPreview(order)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</Button>
        <Button variant="ghost" size="icon" title="View PDF" aria-label="View Sales Order PDF" disabled={busy || draft} onClick={() => void openPdf(order)}><ExternalLink className="h-4 w-4 text-blue-600" /></Button>
        <Button variant="ghost" size="icon" title="View Items" aria-label="View Sales Order items" disabled={busy || !order.itemsCount} onClick={() => void openItems(order)}><FileText className="h-4 w-4" /></Button>
        {draft ? <><Button variant="ghost" size="icon" title="Edit" aria-label="Edit Sales Order" onClick={() => router.push(`/dashboard/sales-orders/${order.order.salesOrderId}/edit`)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Delete draft" aria-label="Delete draft Sales Order" onClick={() => setDeleteTarget(order)}><Trash2 className="h-4 w-4 text-destructive" /></Button></> : null}
      </div>;
    } },
  ], [loadingActionId, openItems, openPdf, openPreview, router]);

  const matchingRows = rows.filter(row => matchesDocumentSearch(search, [row.order.salesOrderNo, row.order.receivedDate, row.order.customerNameSnapshot, row.order.customerId, row.order.customerPONo, row.category, row.order.grandTotal, row.order.orderStatus, row.order.fulfillmentStatus]));
  const categoryOptions = [...new Set([...ORDER_CATEGORIES, ...rows.map((row) => row.category).filter(Boolean), ...(category !== "all" ? [category] : [])])];

  return (
    <div className="p-3 sm:p-6 space-y-6 min-w-0">
      <DocumentRegisterHeader eyebrow="Sales management" title={view === "services" ? "Services / Repair Orders" : "Sales Orders"} description="Create, deliver, and track customer orders from one register." loading={loading} actions={<Button onClick={() => router.push("/dashboard/sales-orders/new")}><Plus className="mr-2 h-4 w-4" />Create Order</Button>} cards={["all", ...ORDER_STATUSES].map(item => ({ label: item === "all" ? "Total" : item.replaceAll("_", " ").toLowerCase().replace(/^./, char => char.toUpperCase()), count: matchingRows.filter(row => item === "all" || row.order.orderStatus === item).length, selected: status === item, onClick: () => setStatus(item) }))} />

      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <EntityTable
        title={view === "services" ? "Services / Repair Register" : "Sales Order Register"}
        columns={columns}
        data={matchingRows.filter(row => status === "all" || row.order.orderStatus === status)}
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        getRowId={(row) => row.order.salesOrderId}
        onRowClick={(row) => router.push(`/dashboard/sales-orders/${row.order.salesOrderId}`)}
        headerActions={<Button variant="outline" onClick={() => router.push(view === "services" ? "/dashboard/sales-orders" : "/dashboard/sales-orders?view=services")}>{view === "services" ? <FileText className="mr-2 h-4 w-4" /> : <Wrench className="mr-2 h-4 w-4" />}{view === "services" ? "All Orders" : "Services / Repair"}</Button>}
        toolbarFilters={<><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Order status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{ORDER_STATUSES.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select><Select value={category} onValueChange={setCategory}><SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categoryOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></>}
        mobileLayout={{ primary: ["salesOrderNo", "customer", "total", "status", "fulfillment"], labels: { salesOrderNo: "Sales Order", receivedDate: "Received", customer: "Customer", customerPO: "Customer PO", category: "Category", total: "Total", status: "Status", fulfillment: "Fulfillment" } }}
      />
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[95vw] max-w-none flex-col sm:max-w-none">
          <DialogHeader><DialogTitle>Sales Order — {preview?.orderNo}</DialogTitle><DialogDescription>Generated Sales Order PDF</DialogDescription></DialogHeader>
          {preview ? <iframe title={`Sales Order ${preview.orderNo} PDF preview`} src={`https://drive.google.com/file/d/${encodeURIComponent(preview.fileId)}/preview`} className="min-h-0 w-full flex-1 rounded-md border" /> : null}
          {preview ? <div className="flex justify-end"><Button variant="outline" onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Open PDF in Drive</Button></div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!items} onOpenChange={(open) => { if (!open) setItems(null); }}>
        <DialogContent className="max-h-[90dvh] sm:max-w-4xl">
          <DialogHeader><DialogTitle>Sales Order Items — {items?.order.salesOrderNo || "Draft Sales Order"}</DialogTitle></DialogHeader>
          {items ? <div className="space-y-4">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div><span className="text-xs text-muted-foreground">Customer</span><p className="font-medium">{items.order.customerNameSnapshot || "—"}</p></div>
              <div><span className="text-xs text-muted-foreground">Received</span><p className="font-medium">{formatDate(items.order.receivedDate)}</p></div>
              <div><span className="text-xs text-muted-foreground">Status</span><p className="font-medium">{items.order.orderStatus}</p></div>
            </div>
            <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground"><tr className="text-left"><th className="px-3 py-2 text-right">#</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-center">Unit</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
              <tbody>{items.items.filter((item) => item.lineStatus !== "INACTIVE").map((item) => <tr key={item.salesOrderItemId} className="border-t"><td className="px-3 py-2 text-right">{item.lineNo}</td><td className="px-3 py-2 text-right">{item.quantity ?? "—"}</td><td className="px-3 py-2 text-center">{item.unitSnapshot || "—"}</td><td className="px-3 py-2">{item.description || item.productNameSnapshot || item.productCodeSnapshot || "—"}</td><td className="px-3 py-2 text-right">{item.unitPrice === null ? "—" : money(item.unitPrice)}</td><td className="px-3 py-2 text-right font-medium">{money(item.lineTotal)}</td></tr>)}</tbody>
              <tfoot className="border-t bg-muted/20"><tr><td colSpan={5} className="px-3 py-2 text-right font-semibold">Grand total:</td><td className="px-3 py-2 text-right font-semibold">{money(items.totals.grandTotal)}</td></tr></tfoot>
            </table></div>
            <div className="flex justify-end"><Button variant="outline" onClick={() => setItems(null)}>Close</Button></div>
          </div> : null}
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog open={!!deleteTarget} title="Delete draft Sales Order" description={`Delete ${deleteTarget?.order.salesOrderNo || "this draft Sales Order"} and its line items? This cannot be undone.`} onClose={() => setDeleteTarget(null)} onConfirm={async () => { if (!deleteTarget) return; try { await salesOrderService.deleteDraft(deleteTarget.order.salesOrderId); toast.success("Draft Sales Order deleted."); setDeleteTarget(null); await load(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Failed to delete the draft Sales Order."); } }} />
    </div>
  );
}

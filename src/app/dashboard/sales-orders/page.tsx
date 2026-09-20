"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityTable, ArrowUpDown } from "@/components/ui/entity-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import salesOrderService, { type OrderRowView } from "@/lib/services/sales-order.service";
import { money, formatDate, orderStatusBadge, fulfillmentBadge, syncBadge, SummaryCards } from "@/components/sales-orders/badges";

const ORDER_STATUSES = ["DRAFT", "CONFIRMED", "ON_HOLD", "CANCELLED", "CLOSED"];
const ORDER_CATEGORIES = ["Consumables", "Services/ Repair", "Project", "Parts", "Supplies", "Treatment Package", "PMS", "Mixed"];
const SYNC_STATUSES = ["PENDING", "RETRY", "FAILED", "SYNCED", "SUPERSEDED"];

export default function SalesOrdersPage(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "services" ? "services" : "all";
  const [rows, setRows] = React.useState<OrderRowView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [syncStatus, setSyncStatus] = React.useState("all");
  const [error, setError] = React.useState("");

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const filters = {
        pageSize: 1000,
        view,
        status: status === "all" ? undefined : status,
        category: category === "all" ? undefined : category,
        syncStatus: syncStatus === "all" ? undefined : syncStatus,
      };
      const result = await salesOrderService.list({ ...filters, page: 1 });
      setRows(result.rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load sales orders.");
    } finally {
      setLoading(false);
    }
  }, [category, status, syncStatus, view]);

  React.useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const columns = React.useMemo<ColumnDef<OrderRowView>[]>(() => [
    {
      id: "salesOrderNo",
      accessorFn: (row) => row.order.salesOrderNo || "Draft",
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Sales Order No.<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ row }) => <div><span className="font-semibold tabular-nums">{row.original.order.salesOrderNo || "Draft"}</span>{row.original.order.legacyTrackerNo ? <span className="block text-xs text-muted-foreground">Legacy #{row.original.order.legacyTrackerNo}</span> : null}</div>,
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
    { id: "sync", accessorFn: (row) => row.syncStatus, header: "Sync", cell: ({ row }) => syncBadge(row.original.syncStatus) },
  ], []);

  const grandTotal = rows.reduce((sum, row) => sum + row.order.grandTotal, 0);
  const openCount = rows.filter((row) => ["DRAFT", "CONFIRMED", "ON_HOLD"].includes(row.order.orderStatus)).length;
  const overdueCount = rows.filter((row) => row.overdue).length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{view === "services" ? "Services / Repair Orders" : "Sales Orders"}</h1>
        <p className="text-sm text-muted-foreground">Create, confirm, deliver, and track customer orders from one register.</p>
      </div>

      <SummaryCards cards={[
        { label: "Total Orders", value: String(rows.length) },
        { label: "Order Value", value: money(grandTotal) },
        { label: "Open Orders", value: String(openCount) },
        { label: "Overdue", value: String(overdueCount), hint: "Required date passed" },
      ]} />

      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <EntityTable
        title={view === "services" ? "Services / Repair Register" : "Sales Order Register"}
        columns={columns}
        data={rows}
        loading={loading}
        getRowId={(row) => row.order.salesOrderId}
        onRowClick={(row) => router.push(`/dashboard/sales-orders/${row.order.salesOrderId}`)}
        onView={(row) => router.push(`/dashboard/sales-orders/${row.order.salesOrderId}`)}
        onEdit={(row) => router.push(`/dashboard/sales-orders/${row.order.salesOrderId}/edit`)}
        headerActions={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button variant="outline" onClick={() => router.push(view === "services" ? "/dashboard/sales-orders" : "/dashboard/sales-orders?view=services")}>{view === "services" ? <FileText className="mr-2 h-4 w-4" /> : <Wrench className="mr-2 h-4 w-4" />}{view === "services" ? "All Orders" : "Services / Repair"}</Button><Button className="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600" onClick={() => router.push("/dashboard/sales-orders/new")}><Plus className="mr-2 h-4 w-4" />Create Order</Button></div>}
        toolbarFilters={<><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Order status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{ORDER_STATUSES.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select><Select value={category} onValueChange={setCategory}><SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{ORDER_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Select value={syncStatus} onValueChange={setSyncStatus}><SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Sync status" /></SelectTrigger><SelectContent><SelectItem value="all">All sync states</SelectItem>{SYNC_STATUSES.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></>}
        mobileLayout={{ primary: ["salesOrderNo", "customer", "total", "status", "fulfillment"], labels: { salesOrderNo: "Sales Order", receivedDate: "Received", customer: "Customer", customerPO: "Customer PO", category: "Category", total: "Total", status: "Status", fulfillment: "Fulfillment", sync: "Sync" } }}
      />
    </div>
  );
}

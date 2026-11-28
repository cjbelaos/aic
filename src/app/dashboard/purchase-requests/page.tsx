"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Eye, Pencil, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityTable } from "@/components/ui/entity-table";
import { useUrlParam } from "@/hooks/use-url-param";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DocumentRegisterHeader } from "@/components/document-register-header";
import { PurchaseRequestForm } from "@/components/purchase-requests/purchase-request-form";
import { PurchaseRequestDetailDialog } from "@/components/purchase-requests/purchase-request-detail-dialog";
import { PurchaseRequestPreviewModal } from "@/components/purchase-request-preview-modal";
import { prApi, prReferenceLabel, salesOrderWarning, type PrView } from "@/components/purchase-requests/api";
import { PR_STATUS_LABELS, type PrStatus } from "@/types/purchaseRequest";

const STATUS_VARIANT: Record<PrStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline", OPEN: "default", PARTIAL: "secondary", COMPLETED: "secondary", CANCELLED: "destructive",
};
const STATUS_ORDER: PrStatus[] = ["DRAFT", "OPEN", "PARTIAL", "COMPLETED", "CANCELLED"];
const ALL = "__all";

const toYmd = (d?: Date) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

export default function PurchaseRequestsPage() {
  const [prs, setPrs] = useState<PrView[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ userId: string; fullName: string; isAdmin: boolean }>({ userId: "", fullName: "", isAdmin: false });
  const [status, setStatus] = useState<PrStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [forFilter, setForFilter] = useState(ALL);
  const [requesterFilter, setRequesterFilter] = useState(ALL);
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  useUrlParam("q", (value) => { setSearch(value); setStatus("all"); setRange(undefined); return true; });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PrView | null>(null);
  const [viewing, setViewing] = useState<PrView | null>(null);
  const [printing, setPrinting] = useState<PrView | null>(null);

  const load = useCallback(
    () => prApi<PrView[]>("/api/purchase-requests")
      .then(setPrs)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load purchase requests."))
      .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void load();
    fetch("/api/auth/me").then((r) => r.json()).then((body) => {
      const u = body?.result;
      if (u) setMe({ userId: u.userId, fullName: u.fullName, isAdmin: u.userRoleId === 1 || !!u.isSuperAdmin });
    }).catch(() => {});
  }, [load]);

  const canChange = useCallback((pr: PrView) => !pr.locked && pr.status !== "CANCELLED" && (pr.requestedByUserId === me.userId || me.isAdmin), [me]);

  const replace = (pr: PrView) => {
    setPrs((prev) => (prev.some((p) => p.prId === pr.prId) ? prev.map((p) => (p.prId === pr.prId ? pr : p)) : [pr, ...prev]));
    setViewing((v) => (v?.prId === pr.prId ? pr : v));
  };

  const cancelPr = async (pr: PrView) => {
    const reason = window.prompt(`Cancel ${pr.prNo || "this draft"}? Enter a reason:`);
    if (!reason?.trim()) return;
    try {
      replace(await prApi<PrView>(`/api/purchase-requests/${encodeURIComponent(pr.prId)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }));
      toast.success(`${pr.prNo || "Draft"} cancelled.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel purchase request.");
    }
  };

  const forKey = (pr: PrView) => `${pr.requestType}:${pr.requestType === "CONTRACT" ? pr.contractId : pr.requestType === "SALES_ORDER" ? pr.salesOrderId : ""}`;
  const productText = (pr: PrView) => pr.lines.map((l) => `${l.productCodeSnapshot} ${l.productNameSnapshot}`).join(" ");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = toYmd(range?.from);
    const to = toYmd(range?.to) || from;
    return prs.filter((pr) =>
      (status === "all" || pr.derivedStatus === status)
      && (forFilter === ALL || forKey(pr) === forFilter)
      && (requesterFilter === ALL || pr.requestedByUserId === requesterFilter)
      && (!from || (pr.requestedDate >= from && pr.requestedDate <= to))
      && (!q || [pr.prNo, pr.salesOrderNoSnapshot, pr.contractNoSnapshot, pr.customerNameSnapshot, pr.requestedByName, productText(pr)].join(" ").toLowerCase().includes(q)));
  }, [prs, status, forFilter, requesterFilter, range, search]);

  const forOptions = useMemo(() => [{ value: ALL, label: "All requests" }, ...[...new Map(prs.map((p) => [forKey(p), prReferenceLabel(p) === "—" ? "No reference" : prReferenceLabel(p)])).entries()].map(([value, label]) => ({ value, label }))], [prs]);
  const requesterOptions = useMemo(() => [{ value: ALL, label: "All requesters" }, ...[...new Map(prs.map((p) => [p.requestedByUserId, p.requestedByName])).entries()].map(([value, label]) => ({ value, label }))], [prs]);

  const columns: ColumnDef<PrView>[] = [
    { id: "prNo", header: "PR No.", accessorFn: (pr) => pr.prNo || "Draft" },
    { accessorKey: "requestedDate", header: "Date" },
    { id: "reference", header: "For", accessorFn: (pr) => prReferenceLabel(pr) },
    { accessorKey: "customerNameSnapshot", header: "Customer" },
    { accessorKey: "requestedByName", header: "Requested by" },
    { accessorKey: "neededByDate", header: "Needed by", cell: ({ row }) => row.original.neededByDate || "—" },
    { id: "lines", header: "Lines", accessorFn: (pr) => pr.lines.length },
    {
      id: "status", header: "Status", accessorFn: (pr) => PR_STATUS_LABELS[pr.derivedStatus],
      cell: ({ row }) => {
        const warn = salesOrderWarning(row.original.salesOrderStatus);
        return <div className="flex flex-wrap gap-1"><Badge variant={STATUS_VARIANT[row.original.derivedStatus]}>{PR_STATUS_LABELS[row.original.derivedStatus]}</Badge>{warn && <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">{warn}</Badge>}</div>;
      },
    },
    {
      id: "rowActions", header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={(e) => { e.stopPropagation(); setViewing(row.original); }}><Eye className="h-4 w-4" /></Button>
          {canChange(row.original) && <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(row.original); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
          {row.original.status === "SUBMITTED" && <Button variant="ghost" size="icon" className="h-8 w-8" title="Print" onClick={(e) => { e.stopPropagation(); setPrinting(row.original); }}><Printer className="h-4 w-4" /></Button>}
          {canChange(row.original) && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Cancel PR" onClick={(e) => { e.stopPropagation(); void cancelPr(row.original); }}><Ban className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="min-w-0 space-y-4 p-3 sm:p-6">
        <DocumentRegisterHeader
          eyebrow="Purchase management"
          title="Purchase Requests"
          description="Items technicians need for confirmed sales orders."
          loading={loading}
          actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />New request</Button>}
          cards={(["all", ...STATUS_ORDER] as const).map((s) => ({
            label: s === "all" ? "Total" : PR_STATUS_LABELS[s],
            count: s === "all" ? prs.length : prs.filter((p) => p.derivedStatus === s).length,
            selected: status === s,
            onClick: () => setStatus(s),
          }))}
        />
        <EntityTable
          title="Purchase Requests"
          hideMobileTitle
          columns={columns}
          data={filtered}
          loading={loading}
          hideTransferButtons
          searchValue={search}
          onSearchChange={setSearch}
          onRowClick={setViewing}
          getRowId={(pr) => pr.prId}
          toolbarFilters={
            <div className="flex flex-wrap gap-2">
              <SearchableSelect className="w-48" value={forFilter} onValueChange={setForFilter} options={forOptions} placeholder="For" />
              <SearchableSelect className="w-48" value={requesterFilter} onValueChange={setRequesterFilter} options={requesterOptions} placeholder="Requester" />
              <DateRangePicker value={range} onChange={setRange} />
            </div>
          }
          mobileLayout={{
            primary: ["prNo", "reference", "status", "requestedDate"],
            labels: { prNo: "PR No.", requestedDate: "Date", reference: "For", customerNameSnapshot: "Customer", requestedByName: "Requested by", neededByDate: "Needed by", lines: "Lines", status: "Status", rowActions: "Actions" },
          }}
        />
      </div>

      {formOpen && <PurchaseRequestForm key={editing?.prId ?? "new"} open={formOpen} onOpenChange={setFormOpen} editing={editing} requesterName={me.fullName} onSaved={replace} />}
      {viewing && <PurchaseRequestDetailDialog pr={viewing} onClose={() => setViewing(null)} onChanged={replace} />}
      {printing && <PurchaseRequestPreviewModal pr={printing} onClose={() => setPrinting(null)} />}
    </>
  );
}

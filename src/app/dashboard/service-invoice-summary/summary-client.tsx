"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import type { InvoiceGroup, ReportPeriod, ServiceInvoiceSummaryReport } from "@/lib/serviceInvoiceSummary";

const groups: { key: InvoiceGroup; label: string }[] = [
  { key: "active", label: "Active (Created + Paid)" },
  { key: "cancelled", label: "Cancelled" },
  { key: "draft", label: "Draft" },
  { key: "void", label: "Void" },
];
const money = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
const pdfMoney = (value: number) => `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const name = (report: ServiceInvoiceSummaryReport) => `service-invoice-summary-${report.startDate}-to-${report.endDate}`;

export default function ServiceInvoiceSummaryClient() {
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [report, setReport] = useState<ServiceInvoiceSummaryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (period === "custom" && (!start || !end || start > end)) { setReport(null); setLoading(false); return; }
    setLoading(true);
    try {
      const query = new URLSearchParams({ period });
      if (period === "custom") { query.set("start", start); query.set("end", end); }
      const response = await fetch(`/api/reports/service-invoice-summary?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to load report.");
      if (currentRequest === requestId.current) setReport(body as ServiceInvoiceSummaryReport);
    } catch (error) {
      if (currentRequest === requestId.current) { setReport(null); toast.error(error instanceof Error ? error.message : "Failed to load report."); }
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [period, start, end]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const exportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const summary = workbook.addWorksheet("Summary");
      summary.addRow(["Service Invoice Summary", `${report.startDate} to ${report.endDate}`, "Asia/Manila"]);
      summary.addRow(["Status", "Count", "Amount (PHP)"]);
      for (const { key, label } of groups) summary.addRow([label, report.totals[key].count, report.totals[key].amount]);
      summary.addRow(["All statuses", report.overall.count, report.overall.amount]);
      summary.getColumn(1).width = 32; summary.getColumn(2).width = 26; summary.getColumn(3).width = 20;
      const customers = workbook.addWorksheet("Customers");
      customers.addRow(["Customer", "Active count", "Active amount", "Cancelled count", "Cancelled amount", "Draft count", "Draft amount", "Void count", "Void amount", "Total count", "Total amount"]);
      for (const row of report.customers) customers.addRow([row.customer, row.active.count, row.active.amount, row.cancelled.count, row.cancelled.amount, row.draft.count, row.draft.amount, row.void.count, row.void.amount, row.total.count, row.total.amount]);
      customers.columns.forEach((column, index) => { column.width = index === 0 ? 36 : 20; });
      const invoices = workbook.addWorksheet("Invoices");
      invoices.addRow(["Invoice No.", "Created (Philippine date)", "Created timestamp", "Invoice date", "Customer", "Status", "Amount (PHP)"]);
      for (const row of report.invoices) invoices.addRow([row.invoiceNo, row.createdDate, row.createdAt, row.invoiceDate, row.customer, row.status, row.amount]);
      invoices.columns.forEach((column, index) => { column.width = index === 4 ? 36 : 24; });
      for (const sheet of workbook.worksheets) { sheet.getRow(sheet.name === "Summary" ? 2 : 1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: sheet.name === "Summary" ? 2 : 1 }]; }
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `${name(report)}.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Excel export failed."); }
    finally { setExporting(false); }
  };

  const exportPdf = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 18;
      const line = (text: string, x = 14, size = 10) => { if (y > 190) { pdf.addPage(); y = 18; } pdf.setFontSize(size); pdf.text(text, x, y); y += size === 10 ? 7 : 9; };
      const row = (cells: string[], positions: number[]) => {
        pdf.setFontSize(8);
        const lines = cells.map((cell, index) => pdf.splitTextToSize(cell, (positions[index + 1] || pageWidth - 10) - positions[index] - 3));
        const height = Math.max(1, ...lines.map((part) => part.length)) * 4.5 + 2;
        if (y + height > 200) { pdf.addPage(); y = 18; }
        lines.forEach((part, index) => pdf.text(part, positions[index], y));
        y += height;
      };
      line("Service Invoice Summary", 14, 16);
      line(`${report.startDate} to ${report.endDate} | Asia/Manila`, 14);
      for (const { key, label } of groups) line(`${label}: ${report.totals[key].count} invoice(s), ${pdfMoney(report.totals[key].amount)}`);
      line(`All statuses: ${report.overall.count} invoice(s), ${pdfMoney(report.overall.amount)}`);
      y += 5; line("Customer breakdown", 14, 12);
      row(["Customer", "Active", "Cancelled", "Draft", "Void", "Total"], [14, 102, 139, 180, 215, 248]);
      for (const item of report.customers) row([item.customer, `${item.active.count} / ${pdfMoney(item.active.amount)}`, `${item.cancelled.count} / ${pdfMoney(item.cancelled.amount)}`, `${item.draft.count} / ${pdfMoney(item.draft.amount)}`, `${item.void.count} / ${pdfMoney(item.void.amount)}`, `${item.total.count} / ${pdfMoney(item.total.amount)}`], [14, 102, 139, 180, 215, 248]);
      y += 5; line("Invoices", 14, 12);
      row(["Invoice No.", "Created", "Invoice date", "Customer", "Status", "Amount"], [14, 48, 84, 120, 211, 247]);
      for (const item of report.invoices) row([item.invoiceNo, item.createdDate, item.invoiceDate, item.customer, item.status, pdfMoney(item.amount)], [14, 48, 84, 120, 211, 247]);
      pdf.save(`${name(report)}.pdf`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "PDF export failed."); }
    finally { setExporting(false); }
  };

  return <div className="space-y-6 p-4 md:p-6">
    <div><h1 className="text-2xl font-semibold">Service Invoice Summary</h1><p className="text-sm text-muted-foreground">Invoices created during the selected period, grouped by current status. Philippine time.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label>Period</Label><Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="custom">Custom Date Range</SelectItem></SelectContent></Select></div>{period === "custom" && <><div className="space-y-1"><Label>From</Label><Input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></div><div className="space-y-1"><Label>Through</Label><Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></div></>}<Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button><Button variant="outline" disabled={!report || exporting || loading} onClick={() => void exportExcel()}>Export Excel</Button><Button variant="outline" disabled={!report || exporting || loading} onClick={() => void exportPdf()}>Export PDF</Button></div>
    {loading && <p>Loading report…</p>}
    {report && !loading && <><p className="text-sm text-muted-foreground">{report.startDate} to {report.endDate} · Monday–Sunday weeks · Amounts in PHP</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{groups.map(({ key, label }) => <Card key={key}><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{report.totals[key].count}</p><p className="text-sm text-muted-foreground">{money(report.totals[key].amount)}</p></CardContent></Card>)}<Card><CardHeader className="pb-2"><CardTitle className="text-sm">All statuses</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{report.overall.count}</p><p className="text-sm text-muted-foreground">{money(report.overall.amount)}</p></CardContent></Card></div>
      <section className="space-y-2"><h2 className="text-lg font-semibold">By customer</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Customer</TableHead>{groups.map(({ key, label }) => <TableHead key={key}>{label}</TableHead>)}<TableHead>All statuses</TableHead></TableRow></TableHeader><TableBody>{report.customers.map((customer) => <TableRow key={customer.customer}><TableCell>{customer.customer}</TableCell>{groups.map(({ key }) => <TableCell key={key}>{customer[key].count}<span className="block text-xs text-muted-foreground">{money(customer[key].amount)}</span></TableCell>)}<TableCell>{customer.total.count}<span className="block text-xs text-muted-foreground">{money(customer.total.amount)}</span></TableCell></TableRow>)}</TableBody></Table></div>{report.customers.length === 0 && <p className="text-sm text-muted-foreground">No invoices were created in this period.</p>}</section>
      <section className="space-y-2"><h2 className="text-lg font-semibold">Invoices</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Invoice No.</TableHead><TableHead>Created (PH)</TableHead><TableHead>Invoice date</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{report.invoices.map((invoice) => <TableRow key={invoice.invoiceNo}><TableCell>{invoice.invoiceNo}</TableCell><TableCell>{invoice.createdDate}</TableCell><TableCell>{invoice.invoiceDate}</TableCell><TableCell>{invoice.customer}</TableCell><TableCell>{invoice.status}</TableCell><TableCell className="text-right">{money(invoice.amount)}</TableCell></TableRow>)}</TableBody></Table></div></section></>}
  </div>;
}

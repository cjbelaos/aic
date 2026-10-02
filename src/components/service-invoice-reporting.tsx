"use client";

import { useState } from "react";
import { PAYMENT_LABELS } from "@/lib/serviceInvoiceTracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import type { InvoiceGroup, ServiceInvoiceSummaryReport } from "@/lib/serviceInvoiceSummary";

const groups: { key: InvoiceGroup; label: string }[] = [
  { key: "active", label: "Active (Created + Paid)" },
  { key: "cancelled", label: "Cancelled" },
  { key: "draft", label: "Draft" },
  { key: "void", label: "Void" },
];
const money = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
const pdfMoney = (value: number) => `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const name = () => "service-invoices-filtered";

export default function ServiceInvoiceReporting({ report, filters, loading, showSummary }: { report: ServiceInvoiceSummaryReport; filters: string[]; loading: boolean; showSummary: boolean }) {
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const summary = workbook.addWorksheet("Summary");
      summary.addRow(["Service Invoice Summary", "Filtered invoices", "Asia/Manila"]);
      const filterSheet = workbook.addWorksheet("Filters");
      for (const filter of filters) filterSheet.addRow([filter]);
      filterSheet.getColumn(1).width = 100;
      summary.addRow(["Status", "Count", "Amount (PHP)"]);
      for (const { key, label } of groups) summary.addRow([label, report.totals[key].count, report.totals[key].amount]);
      summary.addRow(["All statuses", report.overall.count, report.overall.amount]);
      summary.addRow([]); summary.addRow(["Payment label (invoice value, not collected amount)","Count","Invoice value (PHP)"]);
      for (const [key,label] of Object.entries(PAYMENT_LABELS)) { const total = report.paymentTotals[key as keyof typeof PAYMENT_LABELS]; summary.addRow([label,total.count,total.amount]); }
      summary.addRow([]); summary.addRow(["Scanned copy","Count","Invoice value (PHP)"]);
      for (const key of ["scanned","not_scanned"] as const) summary.addRow([key === "scanned" ? "Scanned" : "Not scanned",report.scannedTotals[key].count,report.scannedTotals[key].amount]);
      const categories = workbook.addWorksheet("Categories"); categories.addRow(["Category","Count","Invoice value (PHP)"]);
      for (const row of report.categories) categories.addRow([row.category,row.count,row.amount]);
      categories.getColumn(1).width = 36; categories.getColumn(3).width = 24;
      summary.getColumn(1).width = 32; summary.getColumn(2).width = 26; summary.getColumn(3).width = 20;
      const customers = workbook.addWorksheet("Customers");
      customers.addRow(["Customer", "Active count", "Active amount", "Cancelled count", "Cancelled amount", "Draft count", "Draft amount", "Void count", "Void amount", "Total count", "Total amount"]);
      for (const row of report.customers) customers.addRow([row.customer, row.active.count, row.active.amount, row.cancelled.count, row.cancelled.amount, row.draft.count, row.draft.amount, row.void.count, row.void.amount, row.total.count, row.total.amount]);
      customers.columns.forEach((column, index) => { column.width = index === 0 ? 36 : 20; });
      const invoices = workbook.addWorksheet("Invoices");
      invoices.addRow(["Invoice No.", "Created (Philippine date)", "Created timestamp", "Invoice date", "Customer", "Status", "Amount (PHP)", "Category", "Payment status", "Scanned copy", "Cancellation / void reason"]);
      for (const row of report.invoices) invoices.addRow([row.invoiceNo, row.createdDate, row.createdAt, row.invoiceDate, row.customer, row.status, row.amount, row.category, PAYMENT_LABELS[row.paymentStatus], row.scannedStatus === "scanned" ? "Scanned" : "Not scanned", row.statusReason]);
      invoices.columns.forEach((column, index) => { column.width = index === 4 ? 36 : 24; });
      for (const sheet of workbook.worksheets) { sheet.getRow(sheet.name === "Summary" ? 2 : 1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: sheet.name === "Summary" ? 2 : 1 }]; }
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `${name()}.xlsx`; link.click(); URL.revokeObjectURL(url);
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
      line("Filtered invoices | Asia/Manila", 14);
      for (const filter of filters) {
        for (const part of pdf.splitTextToSize(filter, pageWidth - 28)) line(part);
      }
      for (const { key, label } of groups) line(`${label}: ${report.totals[key].count} invoice(s), ${pdfMoney(report.totals[key].amount)}`);
      line(`All statuses: ${report.overall.count} invoice(s), ${pdfMoney(report.overall.amount)}`);
      line("Payment labels (invoice value, not collected amount)",14,12);
      for (const [key,label] of Object.entries(PAYMENT_LABELS)) { const total = report.paymentTotals[key as keyof typeof PAYMENT_LABELS]; line(`${label}: ${total.count} / ${pdfMoney(total.amount)}`); }
      for (const key of ["scanned","not_scanned"] as const) line(`${key === "scanned" ? "Scanned" : "Not scanned"}: ${report.scannedTotals[key].count} / ${pdfMoney(report.scannedTotals[key].amount)}`);
      line("Categories",14,12);
      for (const item of report.categories) row([item.category,String(item.count),pdfMoney(item.amount)],[14,150,220]);
      y += 5; line("Customer breakdown", 14, 12);
      row(["Customer", "Active", "Cancelled", "Draft", "Void", "Total"], [14, 102, 139, 180, 215, 248]);
      for (const item of report.customers) row([item.customer, `${item.active.count} / ${pdfMoney(item.active.amount)}`, `${item.cancelled.count} / ${pdfMoney(item.cancelled.amount)}`, `${item.draft.count} / ${pdfMoney(item.draft.amount)}`, `${item.void.count} / ${pdfMoney(item.void.amount)}`, `${item.total.count} / ${pdfMoney(item.total.amount)}`], [14, 102, 139, 180, 215, 248]);
      y += 5; line("Invoices", 14, 12);
      row(["Invoice", "Created", "Invoice date", "Customer", "Status", "Payment", "Category", "Scan", "Amount"], [14,40,66,92,132,154,195,225,263]);
      for (const item of report.invoices) { row([item.invoiceNo, item.createdDate, item.invoiceDate, item.customer, item.status, PAYMENT_LABELS[item.paymentStatus],item.category,item.scannedStatus === "scanned" ? "Scanned" : "Not scanned",pdfMoney(item.amount)], [14,40,66,92,132,154,195,225,263]); if (item.statusReason) row([`Reason for ${item.invoiceNo}: ${item.statusReason}`],[14]); }
      pdf.save(`${name()}.pdf`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "PDF export failed."); }
    finally { setExporting(false); }
  };

  return <div className="space-y-6">
    {!showSummary && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={exporting || loading || !report.invoices.length} onClick={() => void exportExcel()}>Export Excel</Button><Button variant="outline" disabled={exporting || loading || !report.invoices.length} onClick={() => void exportPdf()}>Export PDF</Button><span className="self-center text-sm text-muted-foreground">Exports include all filtered invoices and summaries.</span></div>}
    {showSummary && loading && <p role="status">Loading summary...</p>}
    {showSummary && !loading && <><p className="text-sm text-muted-foreground">Summary of all filtered invoices. Creation dates use Philippine time. Amounts in PHP.</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{groups.map(({ key, label }) => <Card key={key}><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{report.totals[key].count}</p><p className="text-sm text-muted-foreground">{money(report.totals[key].amount)}</p></CardContent></Card>)}<Card><CardHeader className="pb-2"><CardTitle className="text-sm">All statuses</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{report.overall.count}</p><p className="text-sm text-muted-foreground">{money(report.overall.amount)}</p></CardContent></Card></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(PAYMENT_LABELS).map(([key,label]) => { const total = report.paymentTotals[key as keyof typeof PAYMENT_LABELS]; return <Card key={key}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{total.count}</p><p>{money(total.amount)}</p></CardContent></Card>; })}{(["scanned","not_scanned"] as const).map(key => <Card key={key}><CardHeader><CardTitle className="text-sm">{key === "scanned" ? "Scanned" : "Not scanned"}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{report.scannedTotals[key].count}</p><p>{money(report.scannedTotals[key].amount)}</p></CardContent></Card>)}</div>
      <p className="text-sm text-muted-foreground">Payment amounts above are invoice values grouped by manual payment labels, not amounts received.</p>
      <section><h2 className="text-lg font-semibold">By category</h2><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Count</TableHead><TableHead>Invoice value</TableHead></TableRow></TableHeader><TableBody>{report.categories.map(item => <TableRow key={item.category}><TableCell>{item.category}</TableCell><TableCell>{item.count}</TableCell><TableCell>{money(item.amount)}</TableCell></TableRow>)}</TableBody></Table></section>
      <section className="space-y-2"><h2 className="text-lg font-semibold">By customer</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Customer</TableHead>{groups.map(({ key, label }) => <TableHead key={key}>{label}</TableHead>)}<TableHead>All statuses</TableHead></TableRow></TableHeader><TableBody>{report.customers.map((customer) => <TableRow key={customer.customer}><TableCell>{customer.customer}</TableCell>{groups.map(({ key }) => <TableCell key={key}>{customer[key].count}<span className="block text-xs text-muted-foreground">{money(customer[key].amount)}</span></TableCell>)}<TableCell>{customer.total.count}<span className="block text-xs text-muted-foreground">{money(customer.total.amount)}</span></TableCell></TableRow>)}</TableBody></Table></div>{report.customers.length === 0 && <p className="text-sm text-muted-foreground">No invoices match the selected filters.</p>}</section>
      <section className="space-y-2"><h2 className="text-lg font-semibold">Invoices</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Invoice No.</TableHead><TableHead>Created (PH)</TableHead><TableHead>Invoice date</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead><TableHead>Scanned copy</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{report.invoices.map((invoice) => <TableRow key={invoice.invoiceNo}><TableCell>{invoice.invoiceNo}</TableCell><TableCell>{invoice.createdDate}</TableCell><TableCell>{invoice.invoiceDate}</TableCell><TableCell>{invoice.customer}</TableCell><TableCell>{invoice.status}{invoice.statusReason && <span className="block text-xs">{invoice.statusReason}</span>}</TableCell><TableCell>{PAYMENT_LABELS[invoice.paymentStatus]}</TableCell><TableCell>{invoice.scannedStatus === "scanned" ? "Scanned" : "Not scanned"}</TableCell><TableCell>{invoice.category}</TableCell><TableCell className="text-right">{money(invoice.amount)}</TableCell></TableRow>)}</TableBody></Table></div></section></>}
  </div>;
}

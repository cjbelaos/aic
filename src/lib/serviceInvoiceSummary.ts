import { paymentStatusFor } from "./serviceInvoiceTracking";
import type { InvoicePaymentStatus } from "../types/serviceInvoice";
import type { ServiceInvoiceSummary } from "../types/serviceInvoice";

export type InvoiceGroup = "active" | "cancelled" | "draft" | "void";
export type ReportPeriod = "today" | "week" | "month" | "custom" | "all";
export type ReportRow = { invoiceNo: string; createdAt: string; createdDate: string; invoiceDate: string; customer: string; status: string; group: InvoiceGroup; amount: number; category: string; paymentStatus: InvoicePaymentStatus; scannedStatus: "scanned" | "not_scanned"; statusReason: string };
export type ReportTotal = { count: number; amount: number };
export type CustomerBreakdown = { customer: string; active: ReportTotal; cancelled: ReportTotal; draft: ReportTotal; void: ReportTotal; total: ReportTotal };
export type ServiceInvoiceSummaryReport = { period: ReportPeriod; startDate: string; endDate: string; totals: Record<InvoiceGroup, ReportTotal>; overall: ReportTotal; customers: CustomerBreakdown[]; invoices: ReportRow[]; paymentTotals: Record<InvoicePaymentStatus, ReportTotal>; scannedTotals: Record<"scanned" | "not_scanned", ReportTotal>; categories: { category: string; count: number; amount: number }[] };

const phDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
export function manilaDate(value: Date): string {
  const parts = Object.fromEntries(phDate.formatToParts(value).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function reportRange(period: ReportPeriod, start?: string, end?: string, now = new Date()): { startDate: string; endDate: string } {
  if (period === "all") return { startDate: "", endDate: "" };
  const today = manilaDate(now);
  if (period === "today") return { startDate: today, endDate: today };
  if (period === "month") return { startDate: `${today.slice(0, 7)}-01`, endDate: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10) };
  if (period === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const startDate = shiftDate(today, -(weekday === 0 ? 6 : weekday - 1));
    return { startDate, endDate: shiftDate(startDate, 6) };
  }
  const validDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (period !== "custom" || !validDate(start) || !validDate(end) || start! > end!) throw new Error("Select a valid custom start and end date.");
  return { startDate: start!, endDate: end! };
}

const empty = (): ReportTotal => ({ count: 0, amount: 0 });
const groupFor = (status: string): InvoiceGroup => status === "cancelled" ? "cancelled" : status === "draft" ? "draft" : status === "void" ? "void" : "active";

export function buildServiceInvoiceSummaryReport(invoices: ServiceInvoiceSummary[], period: ReportPeriod, start?: string, end?: string, now = new Date()): ServiceInvoiceSummaryReport {
  const { startDate, endDate } = reportRange(period, start, end, now);
  const totals = { active: empty(), cancelled: empty(), draft: empty(), void: empty() };
  const overall = empty();
  const paymentTotals = { unpaid: empty(), partial: empty(), full: empty() };
  const scannedTotals = { scanned: empty(), not_scanned: empty() };
  const categoryTotals = new Map<string, ReportTotal>();
  const customers = new Map<string, CustomerBreakdown>();
  const rows: ReportRow[] = [];
  for (const invoice of invoices) {
    if (invoice.status === "deleted") continue;
    const timestamp = new Date(invoice.createdAt);
    const validTimestamp = Number.isFinite(timestamp.getTime());
    if (!validTimestamp && period !== "all") continue;
    const createdDate = validTimestamp ? manilaDate(timestamp) : "";
    if (period !== "all" && (createdDate < startDate || createdDate > endDate)) continue;
    const group = groupFor(invoice.status);
    const amount = Math.round(invoice.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0) * 100) / 100;
    const customer = invoice.companyName || invoice.customerId;
    const paymentStatus = paymentStatusFor(invoice.status, invoice);
    const scannedStatus: "scanned" | "not_scanned" = invoice.scannedStatus === "scanned" ? "scanned" : "not_scanned";
    const category = invoice.category || "Uncategorized";
    paymentTotals[paymentStatus].count++; paymentTotals[paymentStatus].amount += amount;
    scannedTotals[scannedStatus].count++; scannedTotals[scannedStatus].amount += amount;
    const categoryTotal = categoryTotals.get(category) || empty(); categoryTotal.count++; categoryTotal.amount += amount; categoryTotals.set(category,categoryTotal);
    const row = { category, paymentStatus, scannedStatus, statusReason: invoice.statusReason || "", invoiceNo: invoice.invoiceNo, createdAt: invoice.createdAt, createdDate, invoiceDate: invoice.date, customer, status: invoice.status, group, amount };
    rows.push(row);
    const breakdown = customers.get(customer) || { customer, active: empty(), cancelled: empty(), draft: empty(), void: empty(), total: empty() };
    breakdown[group].count++;
    breakdown[group].amount += amount;
    breakdown.total.count++;
    breakdown.total.amount += amount;
    customers.set(customer, breakdown);
    totals[group].count++;
    totals[group].amount += amount;
    overall.count++;
    overall.amount += amount;
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceNo.localeCompare(a.invoiceNo));
  return { period, startDate, endDate, totals, overall, paymentTotals, scannedTotals, categories: [...categoryTotals].map(([category,total]) => ({category,...total})).sort((a,b) => a.category.localeCompare(b.category)), customers: [...customers.values()].sort((a, b) => a.customer.localeCompare(b.customer)), invoices: rows };
}

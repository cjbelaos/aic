import type { ServiceInvoiceSummary } from "@/types/serviceInvoice";

export type InvoiceGroup = "active" | "cancelled" | "draft" | "void";
export type ReportPeriod = "today" | "week" | "month" | "custom";
export type ReportRow = { invoiceNo: string; createdAt: string; createdDate: string; invoiceDate: string; customer: string; status: string; group: InvoiceGroup; amount: number };
export type ReportTotal = { count: number; amount: number };
export type CustomerBreakdown = { customer: string; active: ReportTotal; cancelled: ReportTotal; draft: ReportTotal; void: ReportTotal; total: ReportTotal };
export type ServiceInvoiceSummaryReport = { period: ReportPeriod; startDate: string; endDate: string; totals: Record<InvoiceGroup, ReportTotal>; overall: ReportTotal; customers: CustomerBreakdown[]; invoices: ReportRow[] };

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
  const customers = new Map<string, CustomerBreakdown>();
  const rows: ReportRow[] = [];
  for (const invoice of invoices) {
    if (invoice.status === "deleted") continue;
    const timestamp = new Date(invoice.createdAt);
    if (!Number.isFinite(timestamp.getTime())) continue;
    const createdDate = manilaDate(timestamp);
    if (createdDate < startDate || createdDate > endDate) continue;
    const group = groupFor(invoice.status);
    const amount = Math.round(invoice.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0) * 100) / 100;
    const customer = invoice.companyName || invoice.customerId;
    const row = { invoiceNo: invoice.invoiceNo, createdAt: invoice.createdAt, createdDate, invoiceDate: invoice.date, customer, status: invoice.status, group, amount };
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
  return { period, startDate, endDate, totals, overall, customers: [...customers.values()].sort((a, b) => a.customer.localeCompare(b.customer)), invoices: rows };
}

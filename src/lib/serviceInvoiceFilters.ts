import { paymentStatusFor } from "./serviceInvoiceTracking";
import { manilaDate } from "./serviceInvoiceSummary";

export interface InvoiceFilters {
  customers: readonly string[];
  categories: readonly string[];
  dateFrom: string;
  dateTo: string;
  month: string;
  createdFrom?: string;
  createdTo?: string;
  statuses?: readonly string[];
  paymentStatuses?: readonly string[];
  scannedStatuses?: readonly string[];
  search?: string;
}

export function invoiceCategory(salesOrderId: string | undefined, contractId: string | undefined, categories: ReadonlyMap<string, string>): string {
  if (salesOrderId) return categories.get(salesOrderId) || "Uncategorized";
  return contractId ? "PMS" : "Uncategorized";
}

export const MANUAL_INVOICE_CATEGORIES = ["Service", "Project", "PMS", "Parts", "Consumables", "Supplies", "Treatment Package"] as const;

export function validateManualCategories(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((category) => typeof category !== "string" || !MANUAL_INVOICE_CATEGORIES.some((allowed) => allowed === category))) throw new Error("Invalid invoice category selection.");
  return [...new Set(value)] as string[];
}

export function manualCategoryLabel(categories: readonly string[]): string {
  if (categories.includes("Project")) return "Project";
  if (categories.includes("Service")) return "Service";
  return [...new Set(categories)].sort((a, b) => a === "Parts" ? -1 : b === "Parts" ? 1 : a.localeCompare(b)).join(" / ") || "Uncategorized";
}

export function categoryForInvoice(invoice: { salesOrderId?: string; contractId?: string; drNumber?: number; manualCategories?: string[] }, categories: ReadonlyMap<string, string>, deliveryLinks: ReadonlyMap<number, string>): string {
  const orderId = invoice.drNumber != null ? deliveryLinks.get(invoice.drNumber) || invoice.salesOrderId : invoice.salesOrderId;
  const automatic = invoiceCategory(orderId, invoice.contractId, categories);
  return automatic !== "Uncategorized" ? automatic : manualCategoryLabel(invoice.manualCategories ?? []);
}

export function matchesInvoiceFilters(invoice: { customerId: string; category?: string; manualCategories?: string[]; categorySource?: string; paymentStatus?: "unpaid" | "partial" | "full"; scannedStatus?: string; date: string; createdAt?: string; status?: string; invoiceNo?: string; companyName?: string; preparedBy?: string; poNo?: string; trNo?: string; drNumber?: number; items?: { description: string }[] }, filters: InvoiceFilters): boolean {
  if (invoice.status === "deleted") return false;
  if ((filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) || (filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo)) return false;
  if (filters.paymentStatuses?.length && !filters.paymentStatuses.includes(paymentStatusFor(invoice.status || "", invoice))) return false;
  if (filters.scannedStatuses?.length && !filters.scannedStatuses.includes(invoice.scannedStatus || "not_scanned")) return false;
  if (filters.statuses?.length && !filters.statuses.includes(invoice.status || "")) return false;
  if (filters.createdFrom || filters.createdTo) {
    const timestamp = new Date(invoice.createdAt || "");
    if (!Number.isFinite(timestamp.getTime())) return false;
    const createdDate = manilaDate(timestamp);
    if (filters.createdFrom && createdDate < filters.createdFrom) return false;
    if (filters.createdTo && createdDate > filters.createdTo) return false;
  }
  const query = filters.search?.trim().toLowerCase();
  if (query && ![invoice.invoiceNo, invoice.category, invoice.companyName, invoice.customerId, invoice.date, invoice.status, invoice.preparedBy, invoice.poNo, invoice.trNo, invoice.drNumber, ...(invoice.items?.map(item => item.description) || [])].some(value => String(value ?? "").toLowerCase().includes(query))) return false;
  if (filters.customers.length && !filters.customers.includes(invoice.customerId)) return false;
  if (filters.categories.length) {
    const labels = invoice.categorySource === "manual" && invoice.manualCategories?.length ? invoice.manualCategories : (invoice.category || "Uncategorized").split(" / ");
    if (!filters.categories.some(category => labels.includes(category))) return false;
  }
  if (!filters.dateFrom && !filters.dateTo && !filters.month) return true;
  const date = invoice.date.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return !filters.month || date.slice(0, 7) === filters.month;
}

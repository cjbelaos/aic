export interface InvoiceFilters {
  customers: readonly string[];
  categories: readonly string[];
  dateFrom: string;
  dateTo: string;
  month: string;
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

export function matchesInvoiceFilters(invoice: { customerId: string; category?: string; date: string }, filters: InvoiceFilters): boolean {
  if (filters.customers.length && !filters.customers.includes(invoice.customerId)) return false;
  if (filters.categories.length && !filters.categories.includes(invoice.category || "Uncategorized")) return false;
  if (!filters.dateFrom && !filters.dateTo && !filters.month) return true;
  const date = invoice.date.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return !filters.month || date.slice(0, 7) === filters.month;
}

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

export function categoryForInvoice(invoice: { salesOrderId?: string; contractId?: string; drNumber?: number }, categories: ReadonlyMap<string, string>, deliveryLinks: ReadonlyMap<number, string>): string {
  const orderId = invoice.drNumber != null ? deliveryLinks.get(invoice.drNumber) || invoice.salesOrderId : invoice.salesOrderId;
  return invoiceCategory(orderId, invoice.contractId, categories);
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

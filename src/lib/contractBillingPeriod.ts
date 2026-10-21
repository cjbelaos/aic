function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("A valid contract start date and invoice date are required for quarterly billing.");
  }
  return date;
}

/** Boundaries always use the original start day, avoiding month-end drift. */
export function quarterlyBillingPeriod(startDate: string, invoiceDate: string): { start: string; end: string } {
  const anchor = parseDate(startDate);
  const invoice = parseDate(invoiceDate);
  if (invoice < anchor) throw new Error("The invoice date cannot precede the contract start date.");
  const boundary = (quarter: number) => {
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + quarter * 3, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
    return first;
  };
  let quarter = Math.floor(((invoice.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + invoice.getUTCMonth() - anchor.getUTCMonth()) / 3);
  if (boundary(quarter) > invoice) quarter--;
  const end = boundary(quarter + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: boundary(quarter).toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

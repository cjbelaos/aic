export class QuotationError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'QuotationError'; }
}

export function quotationTermsError(value: { terms?: unknown; delivery?: unknown; warranty?: unknown }): string {
  if (typeof value.terms !== 'string' || !value.terms.trim()) return 'Payment terms are required, including when saving a draft.';
  if (typeof value.delivery !== 'string' || !value.delivery.trim()) return 'Delivery terms are required, including when saving a draft.';
  if (typeof value.warranty !== 'string' || !value.warranty.trim()) return 'Warranty is required, including when saving a draft. Select No warranty when applicable.';
  return '';
}

export function assertQuotationTerms(value: { terms?: unknown; delivery?: unknown; warranty?: unknown }): void {
  const error = quotationTermsError(value);
  if (error) throw new QuotationError(error);
}

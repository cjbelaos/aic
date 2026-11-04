import type { Quotation } from '../types/quotation.ts';

export function quotationDisplayRevision(q: Pick<Quotation, 'revision' | 'revisionPending'>): number {
  return (q.revision || 0) + (q.revisionPending ? 1 : 0);
}

export function quotationRevisionLabel(q: Pick<Quotation, 'quotationNo' | 'revision' | 'revisionPending'>): string {
  const revision = quotationDisplayRevision(q);
  return q.quotationNo + (revision > 0 ? ` — Revision ${revision}` : '');
}

/** Include every rendered input and the edit timestamp; Drive saves do not change content. */
export function quotationSnapshotToken(q: Quotation): string {
  return JSON.stringify({
    quotationNo: q.quotationNo, customerId: q.customerId || '', customer: q.customer,
    description: q.description, date: q.date, terms: q.terms || '', delivery: q.delivery || '', warranty: q.warranty || '',
    preparedBy: q.preparedBy || '', approvedBy: q.approvedBy || '', amount: q.amount, discount: q.discount,
    discountSettings: q.discountSettings || null, shippingFee: q.shippingFee || 0,
    pricingMode: q.pricingMode || 'PER_LINE', singleTotalPrice: q.singleTotalPrice || 0,
    items: q.items.map(i => ({ productId: i.productId || '', description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, notes: i.notes || '', discountSettings: i.discountSettings || null })),
    notation: q.notation.map(n => n.notation), updatedAt: q.updatedAt || '', revision: q.revision || 0,
    revisionPending: q.revisionPending || false,
  });
}

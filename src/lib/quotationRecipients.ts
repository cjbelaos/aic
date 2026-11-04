import type { CompanyContact } from '@/types/companyContact';
import { QuotationError } from '@/lib/quotationTerms';

export const QUOTATION_SALES_CC = 'sales.aerichinnovationcorp@gmail.com';
export interface QuotationRecipients { to: string; cc: string[] }

export function quotationRecipients(companyId: string | undefined, contacts: CompanyContact[]): QuotationRecipients {
  if (!companyId) throw new QuotationError('Select a customer company before sending.');
  const company = contacts.filter(contact => contact.companyId === companyId);
  const primary = company.filter(contact => contact.isPrimary);
  if (primary.length !== 1) throw new QuotationError('Set exactly one primary contact for this company before sending.');
  const to = primary[0].email.trim().toLowerCase();
  const valid = (email: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
  if (!to || !valid(to)) throw new QuotationError('The company primary contact needs a valid email address before sending. Update the company contact.');
  const emails = company.filter(contact => contact !== primary[0]).map(contact => contact.email.trim().toLowerCase()).filter(Boolean);
  if (emails.some(email => !valid(email))) throw new QuotationError('A company contact has an invalid CC email address. Correct it before sending.');
  return { to, cc: [...new Set([...emails, QUOTATION_SALES_CC])].filter(email => email !== to).sort() };
}

export function sameQuotationRecipients(a: QuotationRecipients, b: QuotationRecipients): boolean {
  return a.to === b.to && JSON.stringify([...a.cc].sort()) === JSON.stringify([...b.cc].sort());
}

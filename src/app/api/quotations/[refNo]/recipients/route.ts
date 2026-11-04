import { NextResponse } from 'next/server';
import { requireAuthenticatedSession } from '@/lib/auth/session';
import { getQuotationByRefNo } from '@/lib/quotationSheets';
import { getCompanyContacts } from '@/lib/companyContactSheets';
import { quotationRecipients } from '@/lib/quotationRecipients';
import { assertQuotationTerms, QuotationError } from '@/lib/quotationTerms';

export async function GET(_request: Request, context: { params: Promise<{ refNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { refNo } = await context.params;
    const quotation = await getQuotationByRefNo(refNo);
    if (!quotation) throw new QuotationError('Quotation not found.', 404);
    assertQuotationTerms(quotation);
    return NextResponse.json(quotationRecipients(quotation.customerId, await getCompanyContacts()));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Unable to load quotation recipients.' }, { status: error instanceof QuotationError ? error.status : 500 });
  }
}

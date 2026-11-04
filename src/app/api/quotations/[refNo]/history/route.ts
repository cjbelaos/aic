import { NextResponse } from 'next/server';
import { requireAuthenticatedSession } from '@/lib/auth/session';
import { getQuotationByRefNo } from '@/lib/quotationSheets';
import { getQuotationHistory } from '@/lib/quotationHistory';

export async function GET(_request: Request, { params }: { params: Promise<{ refNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { refNo } = await params;
    if (!await getQuotationByRefNo(refNo)) return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 });
    return NextResponse.json(await getQuotationHistory(refNo));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load quotation history.' }, { status: 500 });
  }
}

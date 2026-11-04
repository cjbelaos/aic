import { NextResponse } from 'next/server';
import { requireAuthenticatedSession } from '@/lib/auth/session';
import { getDatabaseSpreadsheetId, getSheetsClient } from '@/lib/googleSheets';
import { getQuotationByRefNo } from '@/lib/quotationSheets';
import { preserveLegacyQuotation } from '@/lib/quotationHistory';
import { createQuotationPdf } from '@/lib/quotationPdfStorage';
import { quotationSnapshotToken } from '@/lib/quotationRevision';
import { withQuotationLock } from '@/lib/quotationLock';
import { assertQuotationTerms, QuotationError } from '@/lib/quotationTerms';

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { quotationNo, pdfBase64, snapshotToken } = await request.json();
    if (typeof quotationNo !== 'string' || !quotationNo.trim() || typeof snapshotToken !== 'string' || !snapshotToken || typeof pdfBase64 !== 'string' || !pdfBase64.startsWith('JVBERi0') || pdfBase64.length > 26_666_668 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
      throw new QuotationError('A quotation number, saved snapshot and valid PDF under 20 MB are required.');
    }
    const fileLink = await withQuotationLock(quotationNo, async () => {
      const q = await getQuotationByRefNo(quotationNo);
      if (!q) throw new QuotationError('Quotation not found.', 404);
      assertQuotationTerms(q);
      if (quotationSnapshotToken(q) !== snapshotToken) throw new QuotationError('The quotation changed. Load the latest saved quotation before generating its PDF.', 409);
      await preserveLegacyQuotation(q);
      const link = await createQuotationPdf(q, Buffer.from(pdfBase64, 'base64'));
      const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
      const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Quotations!A2:A' })).data.values || [];
      const index = rows.findIndex(r => String(r[0]).trim() === quotationNo.trim());
      if (index < 0) throw new QuotationError('Quotation not found.', 404);
      // A PDF artifact changes no quotation content, so preserve the edit timestamp/token.
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `Quotations!L${index + 2}`, valueInputOption: 'RAW', requestBody: { values: [[link]] } });
      return link;
    });
    return NextResponse.json({ success: true, fileLink });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save quotation PDF.' }, { status: error instanceof QuotationError ? error.status : 500 });
  }
}

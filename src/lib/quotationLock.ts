import { getDatabaseSpreadsheetId, getSheetsClient } from '@/lib/googleSheets';
import { QuotationError } from '@/lib/quotationTerms';

// Header/child deletions shift physical rows, so all quotation mutations share one lock.
const lockTitle = '__QuotationWriteLock';

/** Unique addSheet titles serialize across server instances. Orphaned locks require inspection, never timed theft. */
export async function withQuotationLock<T>(_quotationNo: string, operation: () => Promise<T>): Promise<T> {
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  let sheetId: number | null = null;
  try {
    const result = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { addSheet: { properties: { title: lockTitle, hidden: true, gridProperties: { rowCount: 1, columnCount: 1 } } } },
    ] } });
    sheetId = result.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  } catch (error) {
    if (/already exists/i.test(error instanceof Error ? error.message : '')) throw new QuotationError('Another operation is updating this quotation. Please retry shortly.', 409);
    throw error;
  }
  if (sheetId === null) throw new QuotationError('Unable to verify quotation lock. Contact an administrator.', 503);
  try { return await operation(); }
  finally {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId } }] } })
      .catch(error => console.error('Quotation lock release failed', error instanceof Error ? error.message : 'Unknown error'));
  }
}

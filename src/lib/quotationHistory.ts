import type { sheets_v4 } from 'googleapis';
import { getDatabaseSpreadsheetId, getSheetsClient } from '@/lib/googleSheets';
import { copyLegacyQuotationPdf } from '@/lib/quotationPdfStorage';
import { quotationSnapshotToken } from '@/lib/quotationRevision';
import { QuotationError } from '@/lib/quotationTerms';
import type { Quotation } from '@/types/quotation';
import type { QuotationHistoryEntry } from '@/types/quotation-history';

export const QUOTATION_HISTORY_SHEET = 'QuotationHistory';
const HEADERS = ['SendId', 'QuotationNo', 'Revision', 'State', 'File', 'SnapshotJSON', 'SentBy', 'Recipient', 'SentAt', 'MessageId', 'Error', 'SnapshotToken'];

function historyValues(e: QuotationHistoryEntry) {
  const snapshot = JSON.stringify(e.snapshot);
  if (snapshot.length > 48000 || e.snapshotToken.length > 48000) throw new QuotationError('This quotation has too much text to archive safely. Shorten the descriptions before sending.');
  return [e.sendId, e.quotationNo, e.revision, e.state, e.file, snapshot, e.sentBy, e.recipient, e.sentAt, e.messageId, e.error, e.snapshotToken];
}

function historyEntry(r: unknown[]): QuotationHistoryEntry {
  return { sendId: String(r[0]), quotationNo: String(r[1]), revision: Number(r[2]) || 0, state: String(r[3]) as QuotationHistoryEntry['state'], file: String(r[4] || ''), snapshot: JSON.parse(String(r[5])), sentBy: String(r[6] || ''), recipient: String(r[7] || ''), sentAt: String(r[8] || ''), messageId: String(r[9] || ''), error: String(r[10] || ''), snapshotToken: String(r[11] || '') };
}

async function historySheet(create: boolean): Promise<number | null> {
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  let metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })).data;
  let sheet = metadata.sheets?.find(s => s.properties?.title === QUOTATION_HISTORY_SHEET);
  if (!sheet && !create) return null;
  if (!sheet) {
    try {
      const result = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: QUOTATION_HISTORY_SHEET, gridProperties: { rowCount: 1000, columnCount: 12, frozenRowCount: 1 } } } }] } });
      sheet = { properties: result.data.replies?.[0]?.addSheet?.properties };
    } catch (error) {
      if (!/already exists/i.test(error instanceof Error ? error.message : '')) throw error;
      metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })).data;
      sheet = metadata.sheets?.find(s => s.properties?.title === QUOTATION_HISTORY_SHEET);
    }
  }
  const id = sheet?.properties?.sheetId;
  if (id == null) throw new Error('Unable to resolve quotation history sheet.');
  const header = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${QUOTATION_HISTORY_SHEET}!A1:L1` })).data.values?.[0] || [];
  if (header.length && HEADERS.some((value, i) => header[i] !== value)) throw new Error('QuotationHistory columns do not match the required schema.');
  if (!header.length) {
    if (!create) throw new Error('QuotationHistory headers are missing.');
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${QUOTATION_HISTORY_SHEET}!A1:L1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } });
  }
  return id;
}

async function rawHistory() {
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  const sheetId = await historySheet(false);
  if (sheetId == null) return { sheetId, rows: [] as unknown[][] };
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${QUOTATION_HISTORY_SHEET}!A2:L` })).data.values || [];
  return { sheetId, rows };
}

export async function getQuotationHistory(quotationNo: string): Promise<QuotationHistoryEntry[]> {
  const { rows } = await rawHistory();
  return rows.filter(r => String(r[1]) === quotationNo).map(historyEntry);
}

/** Must be called under the quotation lock. SENT/LEGACY rows are immutable. */
export async function saveQuotationHistoryAttempt(entry: QuotationHistoryEntry): Promise<void> {
  await historySheet(true);
  const { rows } = await rawHistory();
  const index = rows.findIndex(r => r[0] === entry.sendId);
  if (index >= 0 && (rows[index][1] !== entry.quotationNo || ['SENT', 'LEGACY'].includes(String(rows[index][3])))) throw new QuotationError('A completed send history entry cannot be replaced.', 409);
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  if (index < 0) {
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${QUOTATION_HISTORY_SHEET}!A:L`, valueInputOption: 'RAW', requestBody: { values: [historyValues(entry)] } });
  } else {
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${QUOTATION_HISTORY_SHEET}!A${index + 2}:L${index + 2}`, valueInputOption: 'RAW', requestBody: { values: [historyValues(entry)] } });
  }
}

/** Preserve what is actually available; never invent terms or a historical recipient. */
export async function preserveLegacyQuotation(q: Quotation): Promise<void> {
  if (q.status !== 'SENT' && !q.lastSentAt && !q.revisionPending) return;
  const history = await getQuotationHistory(q.quotationNo);
  if (history.some(e => ['SENT', 'LEGACY'].includes(e.state))) return;
  const file = q.file ? await copyLegacyQuotationPdf(q) : '';
  const entry: QuotationHistoryEntry = { sendId: `legacy-${q.quotationNo}`, quotationNo: q.quotationNo, revision: q.revision || 0, state: 'LEGACY', file, snapshot: { ...q, file }, sentBy: q.sentBy || '', recipient: '', sentAt: q.lastSentAt || '', messageId: '', error: 'Legacy record: the original send time, recipient, or unsaved terms may be unavailable.', snapshotToken: quotationSnapshotToken(q) };
  // The stable legacy ID also makes an interrupted archive safe to retry.
  await historySheet(true);
  const { rows } = await rawHistory();
  if (!rows.some(r => r[0] === entry.sendId)) await saveQuotationHistoryAttempt(entry);
}

const cell = (v: string | number): sheets_v4.Schema$CellData => ({ userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: v } });

/** One atomic batch records SMTP success and advances only the sent revision metadata. */
export async function completeQuotationSend(entry: QuotationHistoryEntry): Promise<void> {
  const { ensureQuotationColumns } = await import('@/lib/quotationSheets');
  await ensureQuotationColumns();
  const { rows, sheetId: historyId } = await rawHistory();
  const historyIndex = rows.findIndex(r => r[0] === entry.sendId && r[1] === entry.quotationNo);
  if (historyId == null || historyIndex < 0) throw new Error('The pending send history was not found.');
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })).data;
  const quotationsId = metadata.sheets?.find(s => s.properties?.title === 'Quotations')?.properties?.sheetId;
  if (quotationsId == null) throw new Error('Quotations sheet was not found.');
  const current = (await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Quotations!A2:A' })).data.values || [];
  const index = current.findIndex(r => String(r[0]).trim() === entry.quotationNo);
  if (index < 0) throw new Error('Quotation was not found while recording send.');
  const update = (id: number, row: number, col: number, values: sheets_v4.Schema$CellData[]) => ({ updateCells: { start: { sheetId: id, rowIndex: row, columnIndex: col }, rows: [{ values }], fields: 'userEnteredValue' } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    update(historyId, historyIndex + 1, 0, historyValues(entry).map(v => cell(v))),
    update(quotationsId, index + 1, 11, [cell(entry.file)]),
    update(quotationsId, index + 1, 15, [cell(entry.sentBy), cell('SENT')]),
    update(quotationsId, index + 1, 19, [cell(entry.sentBy), cell(entry.sentAt)]),
    update(quotationsId, index + 1, 24, [cell(entry.revision), { userEnteredValue: { boolValue: false } }, cell(entry.sentAt)]),
  ] } });
}

import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import type { ProformaInvoice } from "@/types/proformaInvoice";
import { ProformaError } from "./domain";

export const PROFORMA_TAB = "ProformaInvoices";
export const PROFORMA_HEADERS = ["Id", "InvoiceNo", "SourceInvoiceNo", "Status", "SalesOrderId", "SalesOrderNo", "TRNo", "Date", "CustomerId", "CompanyName", "TIN", "Address", "PONo", "DRNo", "Notes", "Remarks", "PreparedBy", "ItemsJSON", "TotalAmount", "PDFLink", "ScanLink", "Version", "SourceRow", "ImportIssue", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"] as const;
export const PROFORMA_LEGACY_HEADERS = [...PROFORMA_HEADERS.slice(0, 23), "SyncError", ...PROFORMA_HEADERS.slice(23)];
export const PROFORMA_KEYS: readonly (keyof ProformaInvoice)[] = ["id", "invoiceNo", "sourceInvoiceNo", "status", "salesOrderId", "salesOrderNo", "trNo", "date", "customerId", "companyName", "tin", "address", "poNo", "drNo", "notes", "remarks", "preparedBy", "items", "totalAmount", "pdfLink", "scanLink", "version", "sourceRow", "importIssue", "createdAt", "createdBy", "updatedAt", "updatedBy"];
export function proformaToRow(invoice: ProformaInvoice): Array<string | number> {
  return PROFORMA_KEYS.map(key => key === "items" ? JSON.stringify(invoice.items) : invoice[key] as string | number);
}
export function proformaFromRow(row: unknown[]): ProformaInvoice {
  const result = Object.fromEntries(PROFORMA_KEYS.map((key, i) => [key, key === "items" ? JSON.parse(String(row[i] || "[]")) : ["totalAmount", "version", "sourceRow"].includes(key) ? Number(row[i] || 0) : String(row[i] ?? "")])) as unknown as ProformaInvoice;
  return result;
}
export async function readProformaRawRows(): Promise<unknown[][]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const header = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PROFORMA_TAB}!A1:AB1` })).data.values?.[0] ?? [];
  return (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PROFORMA_TAB}!A1:${header[23] === "SyncError" ? "AC" : "AB"}` })).data.values ?? [];
}
export async function readProformas(): Promise<ProformaInvoice[]> {
  const [headers = [], ...rows] = await readProformaRawRows();
  const legacy = PROFORMA_LEGACY_HEADERS.every((header, index) => headers[index] === header);
  if (!legacy && PROFORMA_HEADERS.some((header, index) => headers[index] !== header)) throw new Error("ProformaInvoices schema is not ready. Run the proforma migration.");
  return rows.filter(row => row[0]).map(row => proformaFromRow(legacy ? [...row.slice(0, 23), ...row.slice(24)] : row));
}
export async function writeProforma(invoice: ProformaInvoice): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const headers = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PROFORMA_TAB}!A1:AB1` })).data.values?.[0] ?? [];
  if (PROFORMA_HEADERS.some((header, index) => headers[index] !== header)) throw new Error("Run the proforma migration before saving with the updated schema.");
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PROFORMA_TAB}!A2:A` })).data.values ?? [];
  const index = rows.findIndex(row => row[0] === invoice.id);
  const rowNumber = index >= 0 ? index + 2 : rows.length + 2;
  const values = proformaToRow(invoice);
  if (String(values[17]).length > 49000) throw new ProformaError("The invoice has too much item text. Shorten the descriptions.");
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${PROFORMA_TAB}!A${rowNumber}:AB${rowNumber}`, valueInputOption: "RAW", requestBody: { values: [values] } });
}
/** addSheet's unique title is an atomic cross-instance mutex. Never steal a lock
 * on a timer: an orphaned lock must be inspected and removed by an administrator. */
export async function withProformaLock<T>(action: () => Promise<T>): Promise<T> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheetId = Math.floor(Math.random() * 1_000_000_000) + 1;
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { addSheet: { properties: { sheetId, title: "__ProformaWriteLock", hidden: true, gridProperties: { rowCount: 1, columnCount: 1 } } } },
      { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, rows: [{ values: [{ userEnteredValue: { stringValue: new Date().toISOString() } }] }], fields: "userEnteredValue" } },
    ] } });
  } catch (error) {
    if (/already exists/i.test(error instanceof Error ? error.message : "")) throw new ProformaError("Another proforma is being saved. Please retry shortly.", 409);
    throw error;
  }
  try { return await action(); }
  finally { await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId } }] } }).catch(error => console.error("Proforma lock release failed", error instanceof Error ? error.message : "Unknown error")); }
}

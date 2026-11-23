import type { sheets_v4 } from "googleapis";
import { isRowWritable, normalizeInvoiceNo, projectionToCells, type TrackerCell, type TrackerProjection } from "./projection.ts";

export const TRACKER_SPREADSHEET_ID = "1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A";
export const TRACKER_SHEET_ID = 449964054;
/**
 * The tracker's "Client Directory" tab is an IMPORTRANGE of this spreadsheet's (SALES ORDER TRACKER)
 * "Client Directory"!A1:H500. New customers go here; writing into the tracker's copy would break the import.
 */
export const DIRECTORY_SPREADSHEET_ID = "14G57IKQ73FCxjZyba216vZlsbsqPYsgPGsjVKzcyzwY";
/** Rows the tracker's IMPORTRANGE carries over (header included). */
export const DIRECTORY_IMPORT_ROWS = 500;
const DIRECTORY_HEADER: Record<number, string> = { 1: "Company Name", 5: "TIN", 6: "Address" };
const EXPECTED_HEADER = ["Category", "Purchase Order No.", "Date", "Invoice No.", "Customer Name", "TIN", "Address", "Description", "Classification", "Total Amount"];
/** Tracker column index of each owned cell, in projection order A,B,C,E,H,J. */
const OWNED_COLUMNS = [0, 1, 2, 4, 7, 9];
const D = 3, F = 5, G = 6;
/** Row 2 (index 1) is the exemplar for formulas, validation and format. */
const EXEMPLAR_ROW_INDEX = 1;

export interface TrackerSnapshot {
  spreadsheetId: string;
  sheetId: number;
  /** Quoted A1 title. */
  title: string;
  /** A:J with FORMULA render; row 1 = header. */
  rows: unknown[][];
  /** Source Client Directory names (col B), exact strings. */
  directoryNames: Set<string>;
  directorySpreadsheetId: string;
  /** Rows used in the source Client Directory, header included. */
  directoryRowCount: number;
}
export interface PlannedRow { invoiceNo: string; rowNumber: number; appended: boolean; cells: TrackerCell[]; fillLookups?: boolean }
export type PlanOutcome = { kind: "write"; row: PlannedRow; changed: boolean } | { kind: "needs_review"; reason: string };

const isBlank = (value: unknown) => value == null || value === "";
const isFormula = (value: unknown) => typeof value === "string" && value.startsWith("=");

export async function readTrackerSnapshot(sheets: sheets_v4.Sheets): Promise<TrackerSnapshot> {
  const spreadsheetId = process.env.SERVICE_INVOICE_TRACKER_SPREADSHEET_ID || TRACKER_SPREADSHEET_ID;
  const sheetId = Number(process.env.SERVICE_INVOICE_TRACKER_SHEET_ID || TRACKER_SHEET_ID);
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties(rowCount))" });
  const tab = metadata.data.sheets?.find(sheet => sheet.properties?.sheetId === sheetId);
  if (!tab?.properties?.title) throw new Error("Service Invoice tracker tab was not found.");
  const title = `'${tab.properties.title.replace(/'/g, "''")}'`;
  const directorySpreadsheetId = process.env.SERVICE_INVOICE_DIRECTORY_SPREADSHEET_ID || DIRECTORY_SPREADSHEET_ID;
  // Tracker rows need FORMULA render (to spot formulas). The directory is read from its source, which
  // is current even while the tracker's IMPORTRANGE copy is still refreshing.
  const [response, directory] = await Promise.all([
    sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: [`${title}!A1:J${tab.properties.gridProperties?.rowCount || 2000}`], valueRenderOption: "FORMULA" }),
    sheets.spreadsheets.values.get({ spreadsheetId: directorySpreadsheetId, range: "'Client Directory'!A1:G", valueRenderOption: "UNFORMATTED_VALUE" }),
  ]);
  const rows = (response.data.valueRanges?.[0]?.values ?? []) as unknown[][];
  if (EXPECTED_HEADER.some((name, index) => rows[0]?.[index] !== name)) throw new Error("Service Invoice tracker headers changed; sync stopped to protect its data.");
  const directoryRows = (directory.data.values ?? []) as unknown[][];
  if (Object.entries(DIRECTORY_HEADER).some(([index, name]) => directoryRows[0]?.[Number(index)] !== name)) throw new Error("SALES ORDER TRACKER Client Directory headers changed; sync stopped to protect its data.");
  const directoryNames = new Set(directoryRows.slice(1).map(row => String(row[1] ?? "")).filter(Boolean));
  return { spreadsheetId, sheetId, title, rows, directoryNames, directorySpreadsheetId, directoryRowCount: directoryRows.length };
}

/** First row number after the last row with an invoice number in D. */
export function firstAppendRow(snapshot: TrackerSnapshot): number {
  let last = 1;
  snapshot.rows.forEach((row, index) => { if (index > 0 && !isBlank(row[D])) last = index + 1; });
  return last + 1;
}

export function planRow(snapshot: TrackerSnapshot, invoiceNo: string, projection: TrackerProjection, lastWritten: TrackerCell[] | undefined, nextAppendRow: () => number): PlanOutcome {
  const key = normalizeInvoiceNo(invoiceNo);
  const matches = snapshot.rows.map((row, index) => ({ row, number: index + 1 })).filter(({ row, number }) => number > 1 && normalizeInvoiceNo(row[D]) === key);
  if (matches.length > 1) return { kind: "needs_review", reason: `Invoice No. ${invoiceNo} appears ${matches.length} times on the tracker (duplicate rows ${matches.map(m => m.number).join(", ")}).` };
  const cells = projectionToCells(projection);
  if (!matches.length) return { kind: "write", changed: true, row: { invoiceNo, rowNumber: nextAppendRow(), appended: true, cells } };
  const { row, number } = matches[0];
  const current = OWNED_COLUMNS.map(column => row[column]);
  if (current.some(isFormula)) return { kind: "needs_review", reason: `Row ${number} has a formula in a column the app fills; left unchanged.` };
  const lookups = [row[F], row[G]];
  if (lookups.some(value => !isBlank(value) && !isFormula(value))) return { kind: "needs_review", reason: `Row ${number} has manual TIN/address values; left unchanged.` };
  if (!isRowWritable(current, lastWritten)) return { kind: "needs_review", reason: `Row ${number} was filled or edited by hand; left unchanged.` };
  const changed = cells.some((cell, index) => String(cell) !== String(current[index] ?? ""));
  return { kind: "write", changed, row: { invoiceNo, rowNumber: number, appended: false, cells, fillLookups: lookups.some(isBlank) || undefined } };
}

function cellValue(value: TrackerCell): sheets_v4.Schema$CellData {
  if (value === "") return { userEnteredValue: {} };
  return { userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value } };
}

export async function applyTrackerWrites(sheets: sheets_v4.Sheets, snapshot: TrackerSnapshot, rows: PlannedRow[], newCustomers: { name: string; tin: string; address: string }[]): Promise<void> {
  const { spreadsheetId, sheetId } = snapshot;
  const clean = (value: string) => value && value.toUpperCase() !== "NULL" ? value : "";
  // Strict dropdown on E: customers must exist in the directory before their rows are written.
  if (newCustomers.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: snapshot.directorySpreadsheetId, range: "'Client Directory'!A:G", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: newCustomers.map(customer => ["", customer.name, "", "", "", clean(customer.tin), clean(customer.address)]) },
    });
  }
  if (!rows.length) return;
  const range = (rowIndex: number, start: number, end: number) => ({ sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: start, endColumnIndex: end });
  const paste = (rowIndex: number, start: number, end: number, pasteType: string): sheets_v4.Schema$Request => ({ copyPaste: { source: range(EXEMPLAR_ROW_INDEX, start, end), destination: range(rowIndex, start, end), pasteType } });
  const requests: sheets_v4.Schema$Request[] = [];
  for (const row of rows) {
    const index = row.rowNumber - 1;
    if (row.appended) requests.push(paste(index, 0, 10, "PASTE_FORMAT"), paste(index, 0, 10, "PASTE_DATA_VALIDATION"), paste(index, F, G + 1, "PASTE_NORMAL"));
    else if (row.fillLookups) requests.push(paste(index, F, G + 1, "PASTE_NORMAL"));
    const [a, b, c, e, h, j] = row.cells;
    const write = (start: number, values: TrackerCell[]) => requests.push({ updateCells: { range: range(index, start, start + values.length), rows: [{ values: values.map(cellValue) }], fields: "userEnteredValue" } });
    write(0, [a, b, c]);
    if (row.appended) write(D, [normalizeInvoiceNo(row.invoiceNo).padStart(4, "0")]);
    write(4, [e]);
    write(7, [h]);
    write(9, [j]);
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

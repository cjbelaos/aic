import { getSheetsClient } from "@/lib/googleSheets";
import type { ProformaInvoice } from "@/types/proformaInvoice";

export const PROFORMA_SOURCE_ID = "1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A";
export const PROFORMA_SOURCE_GID = 1156547389;
export async function readProformaSource() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.PROFORMA_SOURCE_SPREADSHEET_ID || PROFORMA_SOURCE_ID;
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties(rowCount))" });
  const sheet = metadata.data.sheets?.find(sheet => sheet.properties?.sheetId === Number(process.env.PROFORMA_SOURCE_SHEET_ID || PROFORMA_SOURCE_GID));
  if (!sheet?.properties?.title) throw new Error("Proforma source tracker tab was not found.");
  const title = `'${sheet.properties.title.replace(/'/g, "''")}'`;
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A1:T${sheet.properties.gridProperties?.rowCount || 1002}`, valueRenderOption: "UNFORMATTED_VALUE" })).data.values ?? [];
  const expected = ["TR No.", "Date", "Invoice No.", "Customer Name", "TIN", "Address", "Description", "Total Amount"];
  if (expected.some((name, i) => rows[0]?.[i] !== name)) throw new Error("Proforma tracker headers changed; saving stopped to protect its data.");
  return { sheets, spreadsheetId, title, rows, sheetId: sheet.properties.sheetId! };
}
/** Update an existing PFI placeholder first. Payment/collection cells are never written. */
export async function prepareProformaTrackerWrite(invoice: ProformaInvoice, previous?: ProformaInvoice) {
  if (!invoice.invoiceNo || !invoice.sourceInvoiceNo || invoice.importIssue.includes("LEGACY")) return { apply: async () => invoice.sourceRow, rollback: async () => {} };
  const { sheets, spreadsheetId, title, rows, sheetId } = await readProformaSource();
  const matches = rows.map((row, i) => ({ row, number: i + 1 })).filter(({ row }) => row[2] === invoice.sourceInvoiceNo);
  if (matches.length > 1) throw new Error(`Source tracker has duplicate ${invoice.sourceInvoiceNo}; resolve before saving.`);
  const target = matches[0];
  const dateSerial = Math.round((Date.parse(`${invoice.date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
  if (!Number.isFinite(dateSerial)) throw new Error("The proforma date is invalid.");
  const values = [invoice.trNo || invoice.salesOrderNo, dateSerial, invoice.sourceInvoiceNo, invoice.companyName, "", "", invoice.items.map(item => item.productName).join("\n"), invoice.totalAmount];
  if (target && target.row.some((value, i) => i !== 2 && value !== "" && value != null)) {
    // Retry only a row already claimed by this durable app record, or an exact projection.
    const sameProjection = [0, 1, 2, 3, 6, 7].every(index => String(target.row[index] ?? "") === String(values[index]));
    const priorDate = previous ? Math.round((Date.parse(`${previous.date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000) : 0;
    const priorValues = previous ? [previous.trNo || previous.salesOrderNo, priorDate, previous.sourceInvoiceNo, previous.companyName, "", "", previous.items.map(item => item.productName).join("\n"), previous.totalAmount] : [];
    const matchesPrevious = previous?.invoiceNo === invoice.invoiceNo && [0, 1, 2, 3, 6, 7].every(index => String(target.row[index] ?? "") === String(priorValues[index]));
    if (!sameProjection && !matchesPrevious) throw new Error(`${invoice.sourceInvoiceNo} is already in use or was changed on the source tracker. It was not overwritten.`);
  }
  const rowNumber = target?.number ?? Math.max(2, rows.reduce((last, row, i) => row.some(value => value !== "" && value != null) ? i + 2 : last, 2));
  // Native metadata is needed here: E/F are lookup formulas, D is a strict
  // customer-directory dropdown, and payment/aging formulas belong to the tracker.
  const native = await sheets.spreadsheets.get({ spreadsheetId, ranges: [`${title}!A${rowNumber}:T${rowNumber}`, `${title}!A15:T15`], fields: "sheets(properties(sheetId),data(startRow,rowData(values(userEnteredValue,dataValidation,userEnteredFormat(numberFormat)))))" });
  const grids = native.data.sheets?.flatMap(sheet => sheet.data ?? []) ?? [];
  const cells = grids.find(grid => grid.startRow === rowNumber - 1)?.rowData?.[0]?.values ?? [];
  const exemplar = grids.find(grid => grid.startRow === 14)?.rowData?.[0]?.values ?? [];
  const validation = cells[3]?.dataValidation ?? exemplar[3]?.dataValidation;
  if (validation?.strict) {
    const condition = validation.condition;
    let allowed: string[] = [];
    if (condition?.type === "ONE_OF_LIST") allowed = (condition.values ?? []).map(value => String(value.userEnteredValue ?? ""));
    else if (condition?.type === "ONE_OF_RANGE") {
      const range = condition.values?.[0]?.userEnteredValue?.replace(/^=/, "");
      if (!range) throw new Error("Source customer dropdown has no allowed range.");
      const directory = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      allowed = (directory.data.values ?? []).flat().map(String);
    } else throw new Error("Source customer validation changed; review the dropdown before saving.");
    if (!allowed.includes(invoice.companyName)) throw new Error(`Customer "${invoice.companyName}" is not in the source tracker's Client Directory. Add or correct it there, then save again.`);
  }
  const requests: import("googleapis").sheets_v4.Schema$Request[] = [];
  for (const column of [4, 5]) {
    if (!cells[column]?.userEnteredValue?.formulaValue) {
      if (cells[column]?.userEnteredValue) throw new Error("Source TIN/address cells contain manual values; saving stopped to preserve them.");
      if (!exemplar[column]?.userEnteredValue?.formulaValue) throw new Error("The source lookup-formula template is missing.");
      requests.push({ copyPaste: { source: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: column, endColumnIndex: column + 1 }, destination: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: column, endColumnIndex: column + 1 }, pasteType: "PASTE_NORMAL" } });
    }
  }
  if (!cells[3]?.dataValidation && validation) requests.push({ setDataValidation: { range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 3, endColumnIndex: 4 }, rule: validation } });
  for (const [start, data] of [[0, values.slice(0, 4)], [6, values.slice(6, 8)], [16, [invoice.status === "CANCELLED" ? `CANCELLED — ${invoice.remarks}` : invoice.remarks]]] as Array<[number, Array<string | number>]>) {
    if (data.some((_, offset) => cells[start + offset]?.userEnteredValue?.formulaValue)) throw new Error("A proforma-owned source cell now contains a formula; saving stopped to preserve it.");
    requests.push({ updateCells: { range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: start, endColumnIndex: start + data.length }, rows: [{ values: data.map(value => ({ userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value } })) }], fields: "userEnteredValue" } });
  }
  requests.push({ repeatCell: { range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "mmm d yyyy" } } }, fields: "userEnteredFormat.numberFormat" } });
  const remarks = invoice.status === "CANCELLED" ? `CANCELLED — ${invoice.remarks}` : invoice.remarks;
  const ownedColumns = [0, 1, 2, 3, 6, 7, 16];
  const expected = [...values]; expected[16] = remarks;
  async function readCurrentRow() {
    return (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A${rowNumber}:T${rowNumber}`, valueRenderOption: "UNFORMATTED_VALUE" })).data.values?.[0] ?? [];
  }
  const matchesProjection = (row: unknown[]) => ownedColumns.every(column => String(row[column] ?? "") === String(expected[column] ?? ""));
  const rollbackRequests: import("googleapis").sheets_v4.Schema$Request[] = ownedColumns.map(column => ({ updateCells: {
    range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: column, endColumnIndex: column + 1 },
    rows: [{ values: [{ userEnteredValue: cells[column]?.userEnteredValue ?? {} }] }], fields: "userEnteredValue",
  } }));
  for (const column of [4, 5]) if (!cells[column]?.userEnteredValue) rollbackRequests.push({ updateCells: {
    range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: column, endColumnIndex: column + 1 }, rows: [{ values: [{}] }], fields: "userEnteredValue",
  } });
  rollbackRequests.push({ repeatCell: { range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: cells[1]?.userEnteredFormat?.numberFormat ?? undefined } }, fields: "userEnteredFormat.numberFormat" } });
  if (!cells[3]?.dataValidation && validation) rollbackRequests.push({ setDataValidation: { range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 3, endColumnIndex: 4 } } });
  return {
    async apply() {
      try { await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }); }
      catch (error) {
        // Google may have committed the batch before a response was lost.
        const current = await readCurrentRow().catch(() => null);
        if (!current || !matchesProjection(current)) throw error;
      }
      return rowNumber;
    },
    async rollback() {
      const current = await readCurrentRow();
      if (!matchesProjection(current)) throw new Error("The source tracker changed during saving; automatic restoration was stopped to preserve its data.");
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: rollbackRequests } });
    },
  };
}

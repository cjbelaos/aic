import type { sheets_v4 } from "googleapis";

type Row = { rowNumber: number };

async function sheetId(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<number> {
  const response = await sheets.spreadsheets.get({ spreadsheetId, ranges: [sheetName], fields: "sheets.properties(sheetId,title)" });
  const sheet = response.data.sheets?.find((entry) => entry.properties?.title === sheetName);
  const id = sheet?.properties?.sheetId;
  if (id === undefined || id === null) throw new Error(`Sheet ${sheetName} was not found.`);
  return id;
}

/** Replaces a document's child rows without leaving cleared physical rows behind. */
export async function replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName, columnCount, existingRows, values }: {
  sheets: sheets_v4.Sheets; spreadsheetId: string; sheetName: string; columnCount: number;
  existingRows: Row[]; values: unknown[][];
}): Promise<void> {
  const overlap = Math.min(existingRows.length, values.length);
  if (overlap) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: existingRows.slice(0, overlap).map((row, index) => ({ range: `${sheetName}!A${row.rowNumber}:${String.fromCharCode(64 + columnCount)}${row.rowNumber}`, values: [values[index]] })) } });
  if (values.length > overlap) await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetName}!A2:${String.fromCharCode(64 + columnCount)}`, valueInputOption: "USER_ENTERED", requestBody: { values: values.slice(overlap) } });
  const surplus = existingRows.slice(overlap).map((row) => row.rowNumber).sort((a, b) => b - a);
  if (surplus.length) {
    const id = await sheetId(sheets, spreadsheetId, sheetName);
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: surplus.map((rowNumber) => ({ deleteDimension: { range: { sheetId: id, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } })) } });
  }
}

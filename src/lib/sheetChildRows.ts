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
export async function replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName, columnCount, existingRows, values, valueInputOption = "USER_ENTERED" }: {
  sheets: sheets_v4.Sheets; spreadsheetId: string; sheetName: string; columnCount: number;
  existingRows: Row[]; values: unknown[][];
  /** RAW keeps free text (e.g. "1/2", "0012", "=x") exactly as typed. */
  valueInputOption?: "USER_ENTERED" | "RAW";
}): Promise<void> {
  const overlap = Math.min(existingRows.length, values.length);
  if (overlap) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption, data: existingRows.slice(0, overlap).map((row, index) => ({ range: `${sheetName}!A${row.rowNumber}:${String.fromCharCode(64 + columnCount)}${row.rowNumber}`, values: [values[index]] })) } });
  // Anchor on column A: Google appends from the first column of the table it detects
  // in the range, and with A2:<last> blank rows/columns made it pick column L alone,
  // writing DR items into L:W (DRs 4100, 4104-4109). Full-width rows still land in A:<last>.
  if (values.length > overlap) await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetName}!A2:A`, valueInputOption, requestBody: { values: values.slice(overlap) } });
  const surplus = existingRows.slice(overlap).map((row) => row.rowNumber).sort((a, b) => b - a);
  if (surplus.length) {
    const id = await sheetId(sheets, spreadsheetId, sheetName);
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: surplus.map((rowNumber) => ({ deleteDimension: { range: { sheetId: id, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } })) } });
  }
}

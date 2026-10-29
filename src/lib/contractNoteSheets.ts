import { randomUUID } from "node:crypto";
import type { sheets_v4 } from "googleapis";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type { ContractNote } from "@/types/contract";
import { sortContractNotes } from "@/lib/contractNotes";

export const CONTRACT_NOTES_TAB = "ContractNotes";
export const CONTRACT_NOTES_HEADERS = ["NoteId", "ContractId", "Text", "CreatedAt", "UpdatedAt"];

export class ContractNoteError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateContractNoteText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 10_000) {
    throw new ContractNoteError("Note must contain between 1 and 10,000 characters.");
  }
  return value.trim();
}

function cells(values: (string | number)[]): sheets_v4.Schema$RowData {
  return { values: values.map(value => ({ userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value } })) };
}

function noteRow(note: ContractNote): string[] {
  return [note.id, note.contractId, note.text, note.createdAt ?? "", note.updatedAt ?? ""];
}

async function context() {
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const sheetId = (title: string) => metadata.data.sheets?.find(sheet => sheet.properties?.title === title)?.properties?.sheetId ?? undefined;
  return { sheets, spreadsheetId, notesSheetId: sheetId(CONTRACT_NOTES_TAB), contractsSheetId: sheetId("Contracts") };
}

async function readRows(ctx: Awaited<ReturnType<typeof context>>): Promise<string[][]> {
  if (ctx.notesSheetId === undefined) return [];
  const result = await ctx.sheets.spreadsheets.values.get({ spreadsheetId: ctx.spreadsheetId, range: `${CONTRACT_NOTES_TAB}!A1:E` });
  const rows = result.data.values ?? [];
  if (!CONTRACT_NOTES_HEADERS.every((header, i) => rows[0]?.[i] === header)) {
    throw new ContractNoteError("ContractNotes schema does not match. Run the contract notes setup before continuing.", 409);
  }
  return rows.slice(1);
}

function fromRow(row: string[]): ContractNote {
  return { id: String(row[0]), contractId: String(row[1]), text: String(row[2] ?? ""), createdAt: row[3] || undefined, updatedAt: row[4] || undefined };
}

export async function getContractNotes(): Promise<ContractNote[]> {
  return sortContractNotes((await readRows(await context())).filter(row => row[0] && row[1]).map(fromRow));
}

/** Run with contract writes paused. Each migration is one atomic batch, including clearing legacy cells. */
export async function setupContractNotes(apply = false) {
  const ctx = await context();
  if (ctx.contractsSheetId === undefined) throw new ContractNoteError("Contracts sheet not found.", 404);
  const existing = await readRows(ctx);
  const response = await ctx.sheets.spreadsheets.values.get({ spreadsheetId: ctx.spreadsheetId, range: "Contracts!A2:J" });
  const raw = response.data.values ?? [];
  const ids = raw.filter(row => row[0]).map(row => String(row[0]));
  if (new Set(ids).size !== ids.length) throw new ContractNoteError("Duplicate contract IDs must be resolved before migration.", 409);
  const legacy = raw.map((row, i) => ({ id: String(row[0] ?? ""), text: String(row[9] ?? "").trim(), row: i + 1 })).filter(row => row.id && row.text);
  const sheetId = ctx.notesSheetId ?? Math.floor(Math.random() * 1_000_000_000) + 1;
  const requests: sheets_v4.Schema$Request[] = [];
  if (ctx.notesSheetId === undefined) {
    requests.push({ addSheet: { properties: { sheetId, title: CONTRACT_NOTES_TAB, gridProperties: { columnCount: 5, rowCount: Math.max(1000, legacy.length + 1), frozenRowCount: 1 } } } });
    requests.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 }, rows: [cells(CONTRACT_NOTES_HEADERS)], fields: "userEnteredValue" } });
  }
  for (const item of legacy) {
    const id = `legacy:${item.id}`;
    const matches = existing.filter(row => row[0] === id);
    if (matches.length > 1 || (matches.length === 1 && (matches[0][1] !== item.id || matches[0][2] !== item.text))) {
      throw new ContractNoteError(`Legacy note conflict for ${item.id}; review before migrating.`, 409);
    }
    if (!matches.length) requests.push({ appendCells: { sheetId, rows: [cells([id, item.id, item.text, "", ""])], fields: "userEnteredValue" } });
    requests.push({ updateCells: { range: { sheetId: ctx.contractsSheetId, startRowIndex: item.row, endRowIndex: item.row + 1, startColumnIndex: 9, endColumnIndex: 10 }, rows: [cells([""])], fields: "userEnteredValue" } });
  }
  if (apply && requests.length) await ctx.sheets.spreadsheets.batchUpdate({ spreadsheetId: ctx.spreadsheetId, requestBody: { requests } });
  return { mode: apply ? "apply" : "dry-run", createSheet: ctx.notesSheetId === undefined, legacyCount: legacy.length };
}

async function writableContext(contractId: string) {
  const ctx = await context();
  if (ctx.notesSheetId === undefined) throw new ContractNoteError("Run the contract notes setup before saving notes.", 409);
  const result = await ctx.sheets.spreadsheets.values.get({ spreadsheetId: ctx.spreadsheetId, range: "Contracts!A2:J" });
  const matches = (result.data.values ?? []).filter(row => String(row[0]) === contractId);
  if (!matches.length) throw new ContractNoteError("Contract not found.", 404);
  if (matches.length > 1) throw new ContractNoteError("Duplicate contract IDs require review.", 409);
  if (String(matches[0][9] ?? "").trim()) throw new ContractNoteError("Run the contract notes setup to preserve legacy notes before editing.", 409);
  return { ...ctx, rows: await readRows(ctx) };
}

export async function addContractNote(contractId: string, value: unknown): Promise<ContractNote> {
  const text = validateContractNoteText(value);
  const ctx = await writableContext(contractId);
  const note = { id: randomUUID(), contractId, text, createdAt: new Date().toISOString() };
  await ctx.sheets.spreadsheets.batchUpdate({ spreadsheetId: ctx.spreadsheetId, requestBody: { requests: [
    { appendCells: { sheetId: ctx.notesSheetId, rows: [cells(noteRow(note))], fields: "userEnteredValue" } },
  ] } });
  return note;
}

function findNote(rows: string[][], contractId: string, noteId: string): number {
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => row[0] === noteId && row[1] === contractId);
  if (!matches.length) throw new ContractNoteError("Note not found for this contract.", 404);
  if (matches.length > 1) throw new ContractNoteError("Duplicate note IDs require review.", 409);
  return matches[0].index;
}

export async function updateContractNote(contractId: string, noteId: string, value: unknown): Promise<ContractNote> {
  const text = validateContractNoteText(value);
  const ctx = await writableContext(contractId);
  const index = findNote(ctx.rows, contractId, noteId);
  const note = { ...fromRow(ctx.rows[index]), text, updatedAt: new Date().toISOString() };
  await ctx.sheets.spreadsheets.values.update({ spreadsheetId: ctx.spreadsheetId, range: `${CONTRACT_NOTES_TAB}!A${index + 2}:E${index + 2}`, valueInputOption: "RAW", requestBody: { values: [noteRow(note)] } });
  return note;
}

export async function deleteContractNote(contractId: string, noteId: string): Promise<void> {
  const ctx = await writableContext(contractId);
  const index = findNote(ctx.rows, contractId, noteId);
  // Keep the ID so appendCells cannot reuse the row while an older request is in flight.
  await ctx.sheets.spreadsheets.values.update({ spreadsheetId: ctx.spreadsheetId, range: `${CONTRACT_NOTES_TAB}!A${index + 2}:E${index + 2}`, valueInputOption: "RAW", requestBody: { values: [[noteId, "", "", "", ""]] } });
}

/** The parent row and its initial dated note either both save or neither saves. */
export async function appendContractWithInitialNote(row: (string | number)[], value: string): Promise<ContractNote[]> {
  const text = validateContractNoteText(value);
  const ctx = await context();
  if (ctx.notesSheetId === undefined || ctx.contractsSheetId === undefined) throw new ContractNoteError("Run the contract notes setup before creating a contract with a note.", 409);
  await readRows(ctx);
  const note = { id: randomUUID(), contractId: String(row[0]), text, createdAt: new Date().toISOString() };
  await ctx.sheets.spreadsheets.batchUpdate({ spreadsheetId: ctx.spreadsheetId, requestBody: { requests: [
    { appendCells: { sheetId: ctx.contractsSheetId, rows: [cells(row)], fields: "userEnteredValue" } },
    { appendCells: { sheetId: ctx.notesSheetId, rows: [cells(noteRow(note))], fields: "userEnteredValue" } },
  ] } });
  return [note];
}

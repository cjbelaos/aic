import { dbQuery } from "@/lib/db/postgres";
import { SHEET_COLUMNS } from "@/lib/db/sheetColumns.generated";

/**
 * Reads a table as Sheets-style rows: one string[] per record, columns in the
 * tab's order and in the text formats the Sheets API returned, so each module's
 * existing row parser keeps working unchanged on PostgreSQL. Rows come back in
 * the imported sheet order (source_row), then newest records last.
 *
 * Column helpers build the SQL for each position:
 *   col("name")       plain value as text ("" for null)
 *   iso("created_at") timestamp as 2026-11-27T08:40:55.598Z
 *   bool("active")    TRUE / FALSE
 *   ref("company_id", "CompanyId")  link column, falling back to the original value
 */
export const col = (name: string) => `coalesce(${name}::text, '')`;
export const iso = (name: string) => `coalesce(to_char(${name} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')`;
/**
 * A link column whose source value had no matching parent (deleted record) was
 * imported as null with the original kept in import_raw under its sheet header.
 * Reads show the original, exactly as the sheet did.
 */
export const ref = (name: string, header: string) => `coalesce(${name}::text, import_raw->>'${header.replace(/'/g, "''")}', '')`;
export const bool = (name: string) => `case when ${name} then 'TRUE' when not ${name} then 'FALSE' else '' end`;

const TABLE = /^aic\.[a-z_]+$/;

export async function sheetRows(table: string, columns: string[], where = "true"): Promise<string[][]> {
  if (!TABLE.test(table)) throw new Error(`Invalid table name: ${table}`);
  const rows = await dbQuery<{ r: string[] }>(
    `select array[${columns.join(", ")}] as r from ${table} where ${where} order by source_row nulls last, created_at nulls last`,
  );
  return rows.map((row) => row.r);
}

const columnIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** SQL for one sheet column of a tab, by header name or position; unknown columns read as "". */
function columnSql(tab: string, header: string | undefined, index: number): string {
  const spec = SHEET_COLUMNS[tab];
  return (header ? spec.columns[header] : undefined) ?? spec.columns[`#${index}`] ?? "''";
}

/** Rows of a tab with the given headers, in that order (for modules that know their header list). */
export async function sheetRowsByHeaders(tab: string, headers: readonly string[]): Promise<string[][]> {
  const spec = SHEET_COLUMNS[tab];
  if (!spec) throw new Error(`Tab "${tab}" is not mapped to PostgreSQL.`);
  return sheetRows(spec.table, headers.map((header) => columnSql(tab, header, spec.headers.indexOf(header))));
}

/** Rows of a tab for an A1 data range such as "Tab!A2:AD" (data rows only, starting at row 2). */
export async function sheetRowsForRange(range: string): Promise<string[][]> {
  const match = /^'?(.+?)'?!([A-Z]+)2(?::([A-Z]+)\d*)?$/.exec(range);
  if (!match) throw new Error(`Unsupported range for PostgreSQL reads: ${range}`);
  const [, tab, first, last] = match;
  const spec = SHEET_COLUMNS[tab];
  if (!spec) throw new Error(`Tab "${tab}" is not mapped to PostgreSQL.`);
  const from = columnIndex(first);
  const to = columnIndex(last ?? first);
  const columns = Array.from({ length: to - from + 1 }, (_, i) => columnSql(tab, spec.headers[from + i], from + i));
  return sheetRows(spec.table, columns);
}

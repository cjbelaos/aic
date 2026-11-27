import { dbQuery } from "@/lib/db/postgres";

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

import { txQuery } from "@/lib/db/postgres";
import { SHEET_COLUMNS, type SheetTarget } from "@/lib/db/sheetColumns.generated";

/**
 * Writes Sheets-shaped rows (the arrays a module's *ToRow helpers build) to the tab's PostgreSQL table,
 * inside the current transaction: insert, or update by primary key when the record exists. Values are
 * converted the way the importer reads cells: blank → null, booleans and numbers as-is, objects as JSON,
 * wall-clock timestamps in the clock the sheet used. Unknown headers are ignored.
 */
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function param(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function placeholder(index: number, target: SheetTarget): string {
  if (target.clock === "utc") return `($${index}::timestamp at time zone 'UTC')`;
  if (target.clock === "manila") return `($${index}::timestamp at time zone 'Asia/Manila')`;
  return `$${index}::${target.type}`;
}

export async function upsertSheetRows(tab: string, headers: readonly string[], rows: readonly (readonly unknown[])[]): Promise<void> {
  const spec = SHEET_COLUMNS[tab];
  if (!spec) throw new Error(`Tab "${tab}" is not mapped to PostgreSQL.`);
  if (!spec.pk) throw new Error(`Tab "${tab}" has no primary key; it cannot be written by key.`);
  for (const row of rows) {
    const seen = new Set<string>();
    const cells: { target: SheetTarget; value: unknown }[] = [];
    headers.forEach((header, index) => {
      const target = spec.targets[header] ?? spec.targets[`#${index}`];
      if (!target || seen.has(target.column)) return;
      seen.add(target.column);
      cells.push({ target, value: param(row[index]) });
    });
    if (!cells.some((cell) => cell.target.column === spec.pk && cell.value !== null)) throw new Error(`A ${tab} row has no ${spec.pk}.`);
    const columns = cells.map((cell) => quote(cell.target.column));
    const updates = cells.filter((cell) => cell.target.column !== spec.pk).map((cell) => `${quote(cell.target.column)} = excluded.${quote(cell.target.column)}`);
    await txQuery(
      `insert into ${spec.table} (${columns.join(", ")}) values (${cells.map((cell, i) => placeholder(i + 1, cell.target)).join(", ")})
       on conflict (${quote(spec.pk)}) do ${updates.length ? `update set ${updates.join(", ")}` : "nothing"}`,
      cells.map((cell) => cell.value),
    );
  }
}

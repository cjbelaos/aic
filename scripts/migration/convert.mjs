// Cell conversion and snapshot validation for import.mjs (plan §3). Pure functions, no I/O.
// Input cells come in pairs: f = FORMATTED_VALUE (what the app reads today), r = UNFORMATTED_VALUE
// (raw numbers, booleans and date serials). A cell that cannot be converted returns FAIL; the caller
// nulls the typed column and keeps the formatted original in import_raw.
import { TABLES, FOREIGN_KEYS, parseCols } from "./schema-map.mjs";

export const FAIL = Symbol("fail");
const DAY_MS = 86400000;
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MANILA_OFFSET_MS = 8 * 3600000;

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const serialToMs = (serial) => SERIAL_EPOCH_MS + Math.round(serial * DAY_MS);
const validIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(Date.parse(`${s}T00:00:00Z`)) === s;
const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)$/;

/**
 * Decimal text for a Sheet number without binary float noise. App-side float sums left values such as
 * 25996.5599999999 (displayed 25996.56). Rounding to 12 significant digits is used only when it yields a
 * short decimal (noise removed); genuinely long values such as coordinates keep all 15 reliable digits.
 */
export function exactNumeric(r) {
  const short = Number(r.toPrecision(12));
  return String((String(short).split(".")[1] || "").length <= 6 ? short : Number(r.toPrecision(15)));
}

/** Converts one cell to the JSON value Postgres receives for `type`. Returns null for blank, FAIL when unparseable. */
export function convert(type, f, r) {
  const s = String(f ?? "").trim();
  if (s === "" && (r === undefined || r === null || r === "")) return null;
  // Older FTI code wrote the literal text "NULL" into blank numeric cells (141 FTIDetails cells).
  if (type !== "t" && s === "NULL") return null;
  switch (type) {
    case "t":
      return String(f ?? "");
    case "i": {
      if (typeof r === "number") return Number.isSafeInteger(r) && Math.abs(r) <= 2147483647 ? r : FAIL;
      const t = s.replace(/,/g, "");
      return /^-?\d+$/.test(t) && Math.abs(Number(t)) <= 2147483647 ? Number(t) : FAIL;
    }
    case "n": {
      if (typeof r === "number") return Number.isFinite(r) ? exactNumeric(r) : FAIL;
      const t = s.replace(/,/g, "");
      return /^-?\d+(\.\d+)?$/.test(t) ? t : FAIL;
    }
    case "b":
      if (typeof r === "boolean") return r;
      if (/^true$/i.test(s)) return true;
      if (/^false$/i.test(s)) return false;
      return FAIL;
    case "j": {
      try { return JSON.parse(typeof r === "string" ? r : s); } catch { return FAIL; }
    }
    case "d":
      if (typeof r === "number") return isoDate(SERIAL_EPOCH_MS + Math.floor(r) * DAY_MS);
      return validIsoDate(s) ? s : FAIL;
    case "ts":
    case "tm": {
      // Serials and "yyyy-mm-dd hh:mm[:ss]" text are wall-clock times: UTC for ts, Asia/Manila for tm.
      const shift = type === "tm" ? MANILA_OFFSET_MS : 0;
      if (typeof r === "number") return new Date(serialToMs(r) - shift).toISOString();
      const wall = WALL_CLOCK.exec(s);
      if (wall) {
        const ms = Date.parse(`${wall[1]}T${wall[2]}Z`);
        return Number.isNaN(ms) ? FAIL : new Date(ms - shift).toISOString();
      }
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const ms = Date.parse(s);
        return Number.isNaN(ms) ? FAIL : new Date(ms).toISOString();
      }
      return FAIL;
    }
    default:
      throw new Error(`unknown type ${type}`);
  }
}

const key = (v) => (v === null || v === undefined ? null : String(v));

/**
 * Converts and validates a whole snapshot. Returns { tables: Map(table -> {spec, columns, rows}), report }.
 * Rows carry typed values plus source_row/import_raw. The report holds names, counts and source row
 * numbers only, never cell contents.
 */
export function buildImport(snapshot) {
  const report = { tables: {}, conversionFailures: {}, rejected: {}, excluded: {}, rekeyed: {}, orphans: {}, blankRowsSkipped: {}, unmappedColumns: {} };
  const tables = new Map();

  for (const t of TABLES) {
    const data = snapshot.tabs[t.tab];
    if (!data) throw new Error(`snapshot is missing tab ${t.tab}`);
    const { formatted, raw } = data;
    const rows = [];

    if (t.special === "grid") {
      formatted.forEach((cells, i) => rows.push({ row_no: i + 1, cells: cells.map((c) => String(c ?? "")), source_row: i + 1, import_raw: null }));
      tables.set(t.table, { spec: t, columns: ["row_no", "cells"], rows });
      report.tables[t.table] = { source: formatted.length, loaded: rows.length };
      continue;
    }

    const header = (formatted[0] || []).map((h) => String(h ?? "").trim());
    const cols = parseCols(t).map((c) => ({ ...c, idx: c.index ?? header.indexOf(c.header) }));
    const mapped = new Set(cols.map((c) => c.idx));
    const secret = new Set(t.secret || []);
    const label = (i) => header[i] || `#${i}`;
    let blank = 0;

    for (let i = 1; i < formatted.length; i++) {
      const f = formatted[i] || [];
      const r = raw[i] || [];
      if (f.every((v) => String(v ?? "").trim() === "")) { blank++; continue; }
      const row = { source_row: i + 1, import_raw: null };
      const keep = (name, value) => { (row.import_raw ||= {})[name] = value; };
      for (const c of cols) {
        const v = convert(c.type, f[c.idx], r[c.idx]);
        if (v === FAIL) {
          row[c.column] = null;
          if (!secret.has(c.column)) keep(label(c.idx), String(f[c.idx] ?? ""));
          const k = `${t.table}.${c.column}`;
          report.conversionFailures[k] = (report.conversionFailures[k] || 0) + 1;
        } else row[c.column] = v;
      }
      for (let c = 0; c < f.length; c++) {
        if (mapped.has(c) || String(f[c] ?? "").trim() === "") continue;
        keep(label(c), String(f[c]));
        report.unmappedColumns[`${t.table}.${label(c)}`] = (report.unmappedColumns[`${t.table}.${label(c)}`] || 0) + 1;
      }
      if (!t.pk) row.line_no = rows.length + 1;
      rows.push(row);
    }
    if (blank) report.blankRowsSkipped[t.table] = blank;

    // Primary key and unique constraints: a missing key or a later duplicate rejects the row.
    const rejected = [];
    const seen = new Map();
    const constraints = [...(t.pk ? [[t.pk]] : []), ...(t.unique || []).map((u) => u.split(","))];
    const kept = rows.filter((row) => {
      for (const cs of constraints) {
        const vals = cs.map((c) => key(row[c]));
        if (cs.length === 1 && cs[0] === t.pk && vals[0] === null) { rejected.push({ source_row: row.source_row, reason: `missing ${t.pk}` }); return false; }
        if (vals.some((v) => v === null)) continue; // SQL unique allows nulls
        const k = `${cs.join(",")}=${vals.join("\u0000")}`;
        if (seen.has(k) && t.rekeyDuplicates && cs.length === 1 && cs[0] === t.pk) {
          const fresh = `${row[t.pk]}~r${row.source_row}`;
          (report.rekeyed[t.table] ||= []).push({ source_row: row.source_row, reason: `duplicate ${t.pk} (first at row ${seen.get(k)}) kept as ${fresh}` });
          (row.import_raw ||= {})[t.pk] = String(row[t.pk]);
          row[t.pk] = fresh;
          seen.set(`${t.pk}=${fresh}`, row.source_row);
          continue;
        }
        if (seen.has(k)) { rejected.push({ source_row: row.source_row, reason: `duplicate ${cs.join(",")} (first at row ${seen.get(k)})` }); return false; }
        seen.set(k, row.source_row);
      }
      return true;
    });
    if (rejected.length) report.rejected[t.table] = rejected;
    const columns = [...(t.pk ? [] : ["line_no"]), ...cols.map((c) => c.column), "source_row", "import_raw"];
    tables.set(t.table, { spec: t, columns, rows: kept, header, cols });
    report.tables[t.table] = { source: formatted.length - 1 - blank, loaded: kept.length };
  }

  // Stale draft copies: promoting a draft DR with edited items used to rewrite them under the real
  // number and leave the old rows keyed to the negative placeholder (fixed in deliverySheets.ts).
  // Items under a placeholder that no DR row carries are those copies, so they are not imported.
  const drNumbers = new Set(tables.get("delivery_receipts").rows.map((r) => r.dr_number));
  const drItems = tables.get("delivery_receipt_items");
  const stale = [];
  drItems.rows = drItems.rows.filter((row) => {
    if (!(row.dr_number < 0) || drNumbers.has(row.dr_number)) return true;
    stale.push({ source_row: row.source_row, reason: `stale copy under draft placeholder ${row.dr_number}` });
    return false;
  });
  if (stale.length) {
    report.excluded.delivery_receipt_items = stale;
    report.tables.delivery_receipt_items.loaded = drItems.rows.length;
  }

  // Orphaned references: null the typed column, keep the original under its source header.
  // Parents are resolved after rejections so a rejected parent orphans its children visibly.
  for (const [from, to] of FOREIGN_KEYS) {
    const [table, column] = from.split(".");
    const parent = tables.get(to);
    const parentKeys = new Set(parent.rows.map((r) => key(r[parent.spec.pk])));
    const child = tables.get(table);
    const c = child.cols.find((x) => x.column === column);
    let n = 0;
    for (const row of child.rows) {
      const v = key(row[column]);
      if (v === null || parentKeys.has(v)) continue;
      (row.import_raw ||= {})[child.header[c.idx] || `#${c.idx}`] = v;
      row[column] = null;
      n++;
    }
    if (n) report.orphans[from] = n;
  }
  return { tables, report };
}

/** Parent-before-child load order derived from FOREIGN_KEYS (self references ignored). */
export function loadOrder() {
  const deps = new Map(TABLES.map((t) => [t.table, new Set()]));
  for (const [from, to] of FOREIGN_KEYS) {
    const table = from.split(".")[0];
    if (table !== to) deps.get(table).add(to);
  }
  const order = [];
  const state = new Map();
  const visit = (t) => {
    if (state.get(t) === 2) return;
    if (state.get(t) === 1) throw new Error(`foreign-key cycle at ${t}`);
    state.set(t, 1);
    for (const d of deps.get(t)) visit(d);
    state.set(t, 2);
    order.push(t);
  };
  for (const t of deps.keys()) visit(t);
  return order;
}

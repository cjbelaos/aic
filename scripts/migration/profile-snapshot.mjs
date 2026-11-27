// Type profile of a captured snapshot: per column, counts of value shapes. Prints no values.
//   node scripts/migration/profile-snapshot.mjs <snapshotDir> [tab ...]
import { readFileSync, writeFileSync } from "node:fs";

const dir = process.argv[2];
const only = new Set(process.argv.slice(3));
const snap = JSON.parse(readFileSync(`${dir}/database.json`, "utf8"));

export function shapeOf(f, r) {
  const s = String(f ?? "").trim();
  if (s === "") return "empty";
  if (/^(TRUE|FALSE)$/i.test(s)) return "bool";
  if (typeof r === "number") {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s)) return /\d:\d/.test(s) ? "serialDateTime" : "serialDate";
    return Number.isInteger(r) ? "int" : "decimal";
  }
  if (/^0\d+$/.test(s)) return "leadingZero";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return "isoDateTime";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "isoDate";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return "slashDateText";
  if (/^[A-Z][a-z]+ \d{1,2}, \d{4}/.test(s)) return "longDateText";
  if (/^-?[\d,]+(\.\d+)?$/.test(s)) return "numericText";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return "uuid";
  if (/^https?:\/\//.test(s)) return "url";
  if (/^[[{]/.test(s)) return "json";
  return "text";
}

const profile = {};
for (const [tab, { formatted, raw }] of Object.entries(snap.tabs)) {
  if (only.size && !only.has(tab)) continue;
  const header = formatted[0] || [];
  const width = Math.max(header.length, ...formatted.map((r) => r.length));
  const cols = [];
  for (let c = 0; c < width; c++) {
    const counts = {};
    let maxLen = 0;
    for (let i = 1; i < formatted.length; i++) {
      const k = shapeOf(formatted[i]?.[c], raw[i]?.[c]);
      counts[k] = (counts[k] || 0) + 1;
      maxLen = Math.max(maxLen, String(formatted[i]?.[c] ?? "").length);
    }
    cols.push({ col: c, name: header[c] ?? "", maxLen, counts });
  }
  const blankRows = formatted.slice(1).filter((r) => r.every((v) => String(v ?? "").trim() === "")).length;
  profile[tab] = { rows: formatted.length - 1, blankRows, cols };
}
writeFileSync(`${dir}/profile.json`, JSON.stringify(profile, null, 1));
for (const [tab, p] of Object.entries(profile)) {
  console.log(`\n${tab} rows=${p.rows}${p.blankRows ? ` blank=${p.blankRows}` : ""}`);
  for (const c of p.cols) {
    const shapes = Object.entries(c.counts).filter(([k]) => k !== "empty").sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(",");
    console.log(`  ${c.name || `<col${c.col}>`} ${shapes || "all-empty"}${c.counts.empty ? ` ∅${c.counts.empty}` : ""} L${c.maxLen}`);
  }
}

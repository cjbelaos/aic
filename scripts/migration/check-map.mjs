// Verifies schema-map.mjs against a snapshot: mapped headers exist, populated columns are mapped,
// FK targets exist. Prints names and counts only.   node scripts/migration/check-map.mjs <snapshotDir>
import { readFileSync } from "node:fs";
import { TABLES, FOREIGN_KEYS, SKIPPED_TABS, parseCols } from "./schema-map.mjs";

const snap = JSON.parse(readFileSync(`${process.argv[2]}/database.json`, "utf8"));
const problems = [];
const mappedTabs = new Set([...TABLES.map((t) => t.tab), ...SKIPPED_TABS]);
for (const tab of Object.keys(snap.tabs)) if (!mappedTabs.has(tab)) problems.push(`tab not mapped: ${tab}`);

for (const t of TABLES) {
  const data = snap.tabs[t.tab];
  if (!data) { problems.push(`${t.tab}: missing from snapshot`); continue; }
  if (t.special === "grid") continue;
  const header = (data.formatted[0] || []).map((h) => String(h ?? "").trim());
  const cols = parseCols(t);
  const used = new Set();
  const names = new Set();
  for (const c of cols) {
    if (names.has(c.column)) problems.push(`${t.tab}: duplicate column ${c.column}`);
    names.add(c.column);
    const idx = c.index ?? header.indexOf(c.header);
    if (idx < 0) problems.push(`${t.tab}: header not found "${c.header}"`);
    else used.add(idx);
  }
  for (const r of ["id", "line_no", "source_row", "import_raw"]) if (names.has(r) && (t.pk === null || (r !== "id" && r !== "line_no"))) problems.push(`${t.tab}: column name ${r} is reserved`);
  if (t.pk && !names.has(t.pk)) problems.push(`${t.tab}: pk ${t.pk} not a column`);
  const width = Math.max(header.length, ...data.formatted.map((r) => r.length));
  for (let i = 0; i < width; i++) {
    if (used.has(i)) continue;
    const filled = data.formatted.slice(1).filter((r) => String(r[i] ?? "").trim() !== "").length;
    if (filled) problems.push(`${t.tab}: unmapped column ${i} "${header[i] ?? ""}" with ${filled} values (kept in import_raw)`);
  }
}
const cols = new Map(TABLES.map((t) => [t.table, new Set(t.special === "grid" ? ["row_no"] : parseCols(t).map((c) => c.column))]));
for (const [from, to] of FOREIGN_KEYS) {
  const [tb, c] = from.split(".");
  if (!cols.get(tb)?.has(c)) problems.push(`fk source missing: ${from}`);
  if (!cols.has(to)) problems.push(`fk target missing: ${to}`);
}
console.log(problems.length ? problems.join("\n") : "map OK");

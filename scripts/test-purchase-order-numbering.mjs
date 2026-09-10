import assert from "node:assert/strict";

const pattern = /^AIC-PO-(\d{4})-(\d{4})$/;
const year = (date) => {
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  const parsed = new Date(`${date}T00:00:00Z`);
  assert.equal(parsed.toISOString().slice(0, 10), date);
  return date.slice(0, 4);
};
const manual = (number, date) => {
  const value = number.trim().toUpperCase(); const match = value.match(pattern);
  assert.ok(match && Number(match[2]) >= 1, "format must be AIC-PO-YYYY-NNNN with a non-zero suffix");
  assert.equal(match[1], year(date), "number year must equal business-date year");
  return value;
};
const next = (numbers, date) => {
  const y = year(date);
  const suffixes = numbers.map((number) => number.match(pattern)).filter((match) => match?.[1] === y).map((match) => Number(match[2]));
  return `AIC-PO-${y}-${String((suffixes.length ? Math.max(...suffixes) : 0) + 1).padStart(4, "0")}`;
};

assert.equal(next(["AIC-PO-2026-0001", "AIC-PO-2026-0003", "AIC-VTALTE-1002", "bad"], "2026-06-01"), "AIC-PO-2026-0004");
assert.equal(next(["AIC-PO-2026-9999"], "2027-01-01"), "AIC-PO-2027-0001");
assert.equal(manual(" aic-po-2026-0042 ", "2026-03-10"), "AIC-PO-2026-0042");
assert.throws(() => manual("AIC-PO-2025-0001", "2026-03-10"));
assert.throws(() => manual("AIC-PO-2026-0000", "2026-03-10"));
assert.throws(() => manual("AIC-VTALTE-1002", "2026-03-10"));

const draft = "DRAFT-1"; const final = "AIC-PO-2026-0004";
const refs = { legacy: [draft], v2: [draft], history: [draft], preview: draft, pdfName: `PO-06-2026-${final}_Supplier.pdf` };
for (const key of ["legacy", "v2", "history"]) refs[key] = refs[key].map((id) => id === draft ? final : id);
refs.preview = final;
assert.deepEqual(refs.legacy, [final]); assert.deepEqual(refs.v2, [final]); assert.deepEqual(refs.history, [final]); assert.equal(refs.preview, final); assert.match(refs.pdfName, new RegExp(final));
console.log("Purchase-order numbering synthetic checks passed (manual format/year, gaps, annual restart, and draft reference mapping).");

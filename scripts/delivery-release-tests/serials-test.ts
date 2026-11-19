// Delivery Release serial numbers and warranty — focused tests.
//
// Covers serial input parsing, the sheet cell format, warranty dates and status,
// the missing-serial rule, word-by-word register search and DR print rows.

import assert from "node:assert/strict";
import {
  deliveryItemRowValues,
  deliveryPrintRows,
  formatSerialCell,
  parseDeliveryItemRow,
  serialCellValue,
  validateSerialUpdate,
  matchesDeliverySearch,
  parseDeliveryDate,
  parseSerialCell,
  parseSerialInput,
  serialShortfall,
  warrantyEnd,
  warrantyStatus,
} from "../../src/lib/deliverySerials.ts";

const ymd = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// parseSerialInput cleans input
assert.deepEqual(parseSerialInput(" A1, a1,\n\nB2 ,"), ["A1", "B2"]);
assert.deepEqual(parseSerialInput(""), []);

// cell round-trip
assert.equal(formatSerialCell(["A1", "B2"]), "A1, B2");
assert.deepEqual(parseSerialCell("A1, B2"), ["A1", "B2"]);
assert.deepEqual(parseSerialCell(undefined), []);

// parseDeliveryDate handles sheet formats
assert.deepEqual(ymd(parseDeliveryDate("2025-11-19")), [2025, 11, 19]);
assert.deepEqual(ymd(parseDeliveryDate("11/19/2025")), [2025, 11, 19]);
assert.deepEqual(ymd(parseDeliveryDate("1/5/2026")), [2026, 1, 5]);
assert.equal(parseDeliveryDate("19 Nov"), null);
assert.equal(parseDeliveryDate(""), null);
assert.equal(parseDeliveryDate("2025-02-30"), null);

// warrantyEnd: leap day rolls to Feb 28
assert.deepEqual(ymd(warrantyEnd(local(2024, 2, 29))), [2025, 2, 28]);

// warrantyStatus
const base = { date: "2025-11-19", status: "created", serialCount: 1 };
const active = warrantyStatus(base, local(2026, 11, 19));
assert.equal(active?.state, "active");
assert.equal(active?.label, "Under warranty until Nov 19, 2026");
const expired = warrantyStatus(base, local(2026, 11, 20));
assert.equal(expired?.state, "expired");
assert.equal(expired?.label, "Warranty expired Nov 19, 2026");
assert.equal(warrantyStatus({ ...base, serialCount: 0 }, local(2026, 1, 1)), null);
for (const status of ["draft", "cancelled", "deleted"]) {
  assert.equal(warrantyStatus({ ...base, status }, local(2026, 1, 1)), null, status);
}
assert.equal(warrantyStatus({ ...base, date: "soon" }, local(2026, 1, 1)), null);

// serialShortfall
assert.deepEqual(serialShortfall({ requiresSerial: true, quantity: 2, serialCount: 1 }), { missing: 1, label: "Serial missing (1 of 2)" });
assert.equal(serialShortfall({ requiresSerial: true, quantity: 2, serialCount: 2 }), null);
assert.equal(serialShortfall({ requiresSerial: false, quantity: 2, serialCount: 0 }), null);

// matchesDeliverySearch word by word
const fields = ["ZODIAC HEALTH VENTURES INC. (HCCH)", "Reprocessing Machine", "SN-001"];
assert.equal(matchesDeliverySearch("hcch reprocessing", fields), true);
assert.equal(matchesDeliverySearch("sn-001", fields), true);
assert.equal(matchesDeliverySearch("hcch parts", fields), false);
assert.equal(matchesDeliverySearch("  ", fields), true);

// deliveryPrintRows
assert.deepEqual(
  deliveryPrintRows([
    { quantity: 1, unit: "UNIT", description: "Reprocessing Machine", serialNumbers: ["A1", "B2"] },
    { quantity: 3, unit: "PC", description: "Filter" },
  ]),
  [[1, "UNIT", "Reprocessing Machine"], ["", "", "S/N: A1, B2"], [3, "PC", "Filter"]],
);

assert.deepEqual(
  deliveryPrintRows([{ quantity: 1, unit: "PC", description: "X", serialNumbers: "A1" as unknown as string[] }]),
  [[1, "PC", "X"]],
);

// parseDeliveryItemRow legacy row (no column K)
const legacyRow = ["3700", "1", "prod_1", "RM-01", "Reprocessing Machine", "1", "UNIT", "active", "dri-1", ""];
const legacy = parseDeliveryItemRow(legacyRow);
assert.equal(legacy.drNumber, 3700);
assert.equal(legacy.status, "active");
assert.deepEqual(legacy.item.serialNumbers, []);
assert.equal(legacy.item.deliveryReceiptItemId, "dri-1");
assert.equal(legacy.item.quantity, 1);
assert.deepEqual(parseDeliveryItemRow([...legacyRow, "A1, B2"]).item.serialNumbers, ["A1", "B2"]);

// deliveryItemRowValues writes 11 columns with serials in K
const values = deliveryItemRowValues(3700, 0, { ...legacy.item, serialNumbers: ["A1"] });
assert.equal(values.length, 11);
assert.equal(values[1], 1);
assert.equal(values[10], "'A1"); // apostrophe keeps USER_ENTERED from turning serials into numbers/dates
assert.equal(serialCellValue(["00123"]), "'00123");
assert.equal(serialCellValue([]), "");
// writer cleans untrusted request serials
assert.equal(deliveryItemRowValues(1, 0, { ...legacy.item, serialNumbers: [" A1 ", "a1", ""] })[10], "'A1");
assert.equal(deliveryItemRowValues(1, 0, { ...legacy.item, serialNumbers: "A1" as unknown as string[] })[10], "");
const generated = deliveryItemRowValues(3700, 1, { productCode: "X", unit: "PC", description: "X", quantity: 1 });
assert.equal(typeof generated[8], "string");
assert.ok(String(generated[8]).length > 0);
assert.equal(generated[10], "");

// validateSerialUpdate
const ids = ["dri-1", "dri-2"];
const okBody = { items: [{ deliveryReceiptItemId: "dri-1", serialNumbers: [" A1 ", "a1", "B2"] }] };
const completed = validateSerialUpdate({ status: "completed", body: okBody, existingItemIds: ids });
assert.deepEqual(completed, { ok: true, updates: [{ deliveryReceiptItemId: "dri-1", serialNumbers: ["A1", "B2"] }] });
assert.equal(validateSerialUpdate({ status: "created", body: okBody, existingItemIds: ids }).ok, true);
for (const status of ["cancelled", "deleted"]) {
  const result = validateSerialUpdate({ status, body: okBody, existingItemIds: ids });
  assert.equal(result.ok, false, status);
  assert.equal(!result.ok && result.status, 409, status);
}
// validateSerialUpdate rejects unknown id
const unknown = validateSerialUpdate({ status: "completed", body: { items: [{ deliveryReceiptItemId: "dri-x", serialNumbers: ["A1"] }] }, existingItemIds: ids });
assert.equal(!unknown.ok && unknown.status, 422);
const extra = validateSerialUpdate({ status: "completed", body: { items: [{ deliveryReceiptItemId: "dri-1", serialNumbers: ["A1"], quantity: 5 }] }, existingItemIds: ids });
assert.equal(!extra.ok && extra.status, 400);
for (const body of [null, {}, { items: "x" }, { items: [{ deliveryReceiptItemId: "dri-1", serialNumbers: "A1" }] }]) {
  const result = validateSerialUpdate({ status: "completed", body, existingItemIds: ids });
  assert.equal(!result.ok && result.status, 400, JSON.stringify(body));
}

console.log("serials-test passed.");

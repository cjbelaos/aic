// Delivery Release line warehouse sources — focused tests.
//
// A DR line takes its quantity from one or more warehouses. These pin the
// column L cell format, the header-warehouse fallback for old rows, and the
// save validation copy.

import assert from "node:assert/strict";
import {
  effectiveSourcesKey,
  formatSourcesCell,
  lineSources,
  parseSourcesCell,
  sourcesComplete,
  storedSources,
  syncSingleSource,
  validateLineSources,
} from "../../src/lib/deliverySources.ts";

const W = (warehouseId: string, quantity: number) => ({ warehouseId, quantity });

// parseSourcesCell / formatSourcesCell
assert.deepEqual(parseSourcesCell("WH-A:2;WH-B:3"), [W("WH-A", 2), W("WH-B", 3)]);
assert.deepEqual(parseSourcesCell(""), []);
assert.deepEqual(parseSourcesCell(undefined), []);
assert.deepEqual(parseSourcesCell("WH-A:0;:3;WH-B:x"), []);
assert.deepEqual(parseSourcesCell(formatSourcesCell([W("WH-A", 2), W("WH-B", 3)])), [W("WH-A", 2), W("WH-B", 3)]);
assert.equal(formatSourcesCell([]), "");
assert.equal(formatSourcesCell(undefined), "");

// lineSources: stored parts win, else the header warehouse takes the whole line
assert.deepEqual(lineSources({ quantity: 5 }, "W1"), [W("W1", 5)]);
assert.deepEqual(lineSources({ quantity: 5, sources: [W("W2", 2), W("W3", 3)] }, "W1"), [W("W2", 2), W("W3", 3)]);
assert.deepEqual(lineSources({ quantity: 5 }, ""), []);
assert.deepEqual(lineSources({ quantity: 0 }, "W1"), []);

// validateLineSources
const active = (id: string) => id !== "OLD";
const salt = (sources: { warehouseId: string; quantity: number }[], tracked = true) => [{ productName: "Salt", quantity: 5, tracked, sources }];
assert.equal(validateLineSources(salt([W("W1", 2), W("W2", 2)]), active), "Salt: warehouse quantities (4) must add up to 5.");
assert.equal(validateLineSources(salt([W("W1", 2), W("W1", 3)]), active), "Salt: each warehouse can appear once.");
assert.equal(validateLineSources(salt([W("OLD", 5)]), active), "Salt: warehouse must be an active warehouse.");
assert.equal(validateLineSources(salt([]), active), "Salt: choose a warehouse.");
assert.equal(validateLineSources(salt([], false), active), null);
assert.equal(validateLineSources(salt([W("W1", 2), W("W2", 3)]), active), null);

// effectiveSourcesKey: an old row and an explicit header part are the same stock
assert.equal(
  effectiveSourcesKey([{ productId: "P1", quantity: 5 }], "W1"),
  effectiveSourcesKey([{ productId: "P1", quantity: 5, sources: [W("W1", 5)] }], "W1"),
);
assert.notEqual(
  effectiveSourcesKey([{ productId: "P1", quantity: 5 }], "W1"),
  effectiveSourcesKey([{ productId: "P1", quantity: 5, sources: [W("W1", 2), W("W2", 3)] }], "W1"),
);

// syncSingleSource: one part follows the line, a split is the user's
assert.deepEqual(syncSingleSource([], 5, "W1"), [W("W1", 5)]);
assert.deepEqual(syncSingleSource(undefined, 5, "W1"), [W("W1", 5)]);
assert.deepEqual(syncSingleSource([W("W2", 4)], 5, "W1"), [W("W2", 5)]);
assert.deepEqual(syncSingleSource([W("W1", 2), W("W2", 3)], 6, "W1"), [W("W1", 2), W("W2", 3)]);
assert.deepEqual(syncSingleSource([], 5, ""), []);

// sourcesComplete
assert.equal(sourcesComplete([{ quantity: 5, sources: [W("W1", 2), W("W2", 3)] }]), true);
assert.equal(sourcesComplete([{ quantity: 6, sources: [W("W1", 2), W("W2", 3)] }]), false);
assert.equal(sourcesComplete([{ quantity: 5, sources: [] }]), false);
assert.equal(sourcesComplete([{ quantity: 0 }]), true);

// storedSources: a single default-warehouse part is the same as "not set"
assert.equal(storedSources([W("W1", 5)], "W1"), undefined);
assert.deepEqual(storedSources([W("W2", 5)], "W1"), [W("W2", 5)]);
assert.deepEqual(storedSources([W("W1", 2), W("W2", 3)], "W1"), [W("W1", 2), W("W2", 3)]);

console.log("sources-test passed.");

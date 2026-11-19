// Warehouse rules — focused tests: automatic IDs, required fields, unique codes.

import assert from "node:assert/strict";
import { nextWarehouseId, validateWarehouse } from "../../src/lib/warehouseRules.ts";

// nextWarehouseId: highest WH-n + 1, never reuses a number
assert.equal(nextWarehouseId([]), "WH-1");
assert.equal(nextWarehouseId(["WH-1", "WH-2"]), "WH-3");
assert.equal(nextWarehouseId(["WH-1", "wh-7", "WH-3"]), "WH-8");
assert.equal(nextWarehouseId(["", "OLD", "WH-x"]), "WH-1", "ignores IDs that are not WH-<number>");

const valid = { code: "MAIN", name: "Main Warehouse", addressLines: "1 Road", cityProvincePostal: "Manila 1000" };
const existing = [{ warehouseId: "WH-1", code: "MAIN", name: "Main Warehouse" }];

// required fields
assert.equal(validateWarehouse(valid, [], undefined), null);
for (const field of ["code", "name", "addressLines", "cityProvincePostal"] as const) {
  assert.match(validateWarehouse({ ...valid, [field]: "   " }, [], undefined) ?? "", /required/i, field);
}

// unique codes, ignoring case and spaces; editing keeps its own code
assert.match(validateWarehouse({ ...valid, code: " main " }, existing, undefined) ?? "", /Code MAIN is already used by Main Warehouse/);
assert.equal(validateWarehouse(valid, existing, "WH-1"), null, "a warehouse may keep its own code");
assert.match(validateWarehouse(valid, [...existing, { warehouseId: "WH-2", code: "BR", name: "Branch" }], "WH-2") ?? "", /already used/);

console.log("Warehouse rule tests passed.");

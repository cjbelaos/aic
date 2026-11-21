import assert from "node:assert/strict";
import { rowToItem, rowToPr } from "../../src/lib/purchaseRequests/rows.ts";

// Legacy rows (no trailing columns) read as Sales Order requests.
const legacy = rowToPr(["PR000001", "AIC-PR-2026-0001", "SUBMITTED", "SO1", "AIC-SO-2026-0001"]);
assert.equal(legacy.requestType, "SALES_ORDER");
assert.equal(legacy.contractId, "");

const contractRow: unknown[] = Array(19).fill("");
contractRow[0] = "PR000002";
contractRow.push("CONTRACT", "CTR-0003", "CTR-0003");
const c = rowToPr(contractRow);
assert.equal(c.requestType, "CONTRACT");
assert.equal(c.contractId, "CTR-0003");
assert.equal(c.contractNoSnapshot, "CTR-0003");
assert.equal(rowToPr([...Array(19).fill(""), "bogus"]).requestType, "SALES_ORDER");

const itemRow: unknown[] = Array(23).fill("");
itemRow.push("CTI-0007");
assert.equal(rowToItem(itemRow).contractItemId, "CTI-0007");
assert.equal(rowToItem([]).contractItemId, "");

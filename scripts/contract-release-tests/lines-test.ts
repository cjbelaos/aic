import assert from "node:assert/strict";
import { buildContractReleaseRows, validateContractLines } from "../../src/lib/contractReleases/lines.ts";
import type { Contract, ContractItem } from "../../src/types/contract.ts";
import type { ContractLine, DeliveryItem } from "../../src/types/deliveryReceipt.ts";

const contracts = [
  { id: "CTR-0001", companyId: "C1", agreementType: "Contract", startDate: "2026-01-01", endDate: "2026-12-31", status: "Active" },
  { id: "CTR-0002", companyId: "C1", agreementType: "PO", startDate: "2026-01-01", endDate: "2026-12-31", status: "Active" },
  { id: "CTR-0003", companyId: "C2", agreementType: "Contract", startDate: "2026-01-01", endDate: "2026-12-31", status: "Active" },
  { id: "CTR-0004", companyId: "C1", forCompanyId: "HF", agreementType: "Contract", startDate: "2026-01-01", endDate: "2026-12-31", status: "Active" },
] as Contract[];
const ci = (id: string, contractId: string, productCode: string, productId?: string, status: "Active" | "Inactive" = "Active"): ContractItem =>
  ({ id, contractId, productCode, productId, entitledQty: 2, frequency: "Monthly", status });
const contractItems = [
  ci("CTI-1", "CTR-0001", "INK-A", "P-A"),
  ci("CTI-2", "CTR-0001", "INK-B"),
  ci("CTI-3", "CTR-0002", "INK-C"),
  ci("CTI-4", "CTR-0003", "INK-A", "P-A"),
  ci("CTI-5", "CTR-0001", "INK-D", undefined, "Inactive"),
  ci("CTI-6", "CTR-0004", "INK-A", "P-A"),
];
const items: DeliveryItem[] = [
  { productCode: "INK-A", productId: "P-A", unit: "pc", description: "A", quantity: 3 },
  { productCode: "ink-b", unit: "pc", description: "B", quantity: 2 },
  { productCode: "INK-C", unit: "pc", description: "C", quantity: 1 },
  { productCode: "INK-D", unit: "pc", description: "D", quantity: 1 },
];
const v = (lines: ContractLine[], extra: { companyId?: string; forCompanyId?: string; salesOrderId?: string; items?: DeliveryItem[]; contracts?: Contract[]; date?: string } = {}) =>
  validateContractLines({ lines, companyId: extra.companyId ?? "C1", forCompanyId: extra.forCompanyId, salesOrderId: extra.salesOrderId, items: extra.items ?? items, contractItems, contracts: extra.contracts ?? contracts, date: extra.date ?? "2026-06-01", today: "2026-06-01" });
const err = (r: ReturnType<typeof v>) => ("error" in r ? r.error : "");
const L = (contractItemId: string, quantity: number, deliveryLineIndex: number): ContractLine => ({ contractItemId, quantity, deliveryLineIndex });

assert.deepEqual(v([]), { ok: true });
// FOR client: strict match, blank only with blank.
assert.match(err(v([L("CTI-6", 1, 0)])), /different client/);
assert.deepEqual(v([L("CTI-6", 1, 0)], { forCompanyId: "HF" }), { ok: true });
assert.match(err(v([L("CTI-1", 1, 0)], { forCompanyId: "HF" })), /different client/);
assert.match(err(v([L("CTI-6", 1, 0)], { forCompanyId: "PL" })), /different client/);
assert.deepEqual(v([L("CTI-1", 2, 0), L("CTI-2", 2, 1)]), { ok: true });
assert.match(err(v([L("CTI-1", 1, 0)], { salesOrderId: "SO-1" })), /Sales Order/);
assert.match(err(v([L("CTI-404", 1, 0)])), /not found/);
assert.match(err(v([L("CTI-5", 1, 3)])), /inactive/);
assert.match(err(v([L("CTI-4", 1, 0)])), /different customer/);
assert.match(err(v([L("CTI-1", 1, 9)])), /line/);
assert.match(err(v([L("CTI-1", 1, -1)])), /line/);
assert.match(err(v([L("CTI-1", 1, 1)])), /does not match/);
// productId on both sides wins over productCode
assert.match(err(v([L("CTI-1", 1, 0)], { items: [{ productCode: "INK-A", productId: "P-Z", unit: "pc", description: "A", quantity: 3 }] })), /does not match/);
// case-insensitive productCode when productId missing on one side
assert.deepEqual(v([L("CTI-2", 1, 1)]), { ok: true });
assert.match(err(v([L("CTI-1", 0, 0)])), /quantity/);
assert.match(err(v([L("CTI-1", 1.5, 0)])), /quantity/);
assert.match(err(v([L("CTI-1", 4, 0)])), /quantity/);
assert.match(err(v([L("CTI-1", 1, 0), L("CTI-3", 1, 2)])), /one agreement/);

// Review I2: an expired or non-Active agreement cannot take a release
assert.match(err(v([L("CTI-1", 1, 0)], { contracts: contracts.map(c => c.id === "CTR-0001" ? { ...c, endDate: "2026-05-31" } : c) })), /not active/);
assert.match(err(v([L("CTI-1", 1, 0)], { contracts: contracts.map(c => c.id === "CTR-0001" ? { ...c, status: "Closed" as const } : c) })), /not active/);
// Review I4: the DR date must be ISO before release rows are written
assert.match(err(v([L("CTI-1", 1, 0)], { date: "" })), /date/);
assert.match(err(v([L("CTI-1", 1, 0)], { date: "6/1/2026" })), /date/);
// Review I1: rows built in one batch get distinct sequential ids
{
  const rows = buildContractReleaseRows({
    lines: [L("CTI-1", 2, 0), L("CTI-2", 1, 1)], contractItems, lastReleaseId: "REL-0041",
    date: "2026-06-01", releasedBy: "Ana", remarks: "r", drNumber: 5001,
    periodOf: () => ({ year: 2026, month: 6, quarter: 2 }),
  });
  assert.deepEqual(rows.map(r => r.id), ["REL-0042", "REL-0043"]);
  assert.equal(rows[0].contractId, "CTR-0001"); assert.equal(rows[1].quantity, 1); assert.equal(rows[0].drNumber, 5001);
  assert.equal(rows[0].status, "Completed"); assert.equal(rows[0].periodMonth, 6);
  assert.equal(buildContractReleaseRows({ lines: [L("CTI-1", 1, 0)], contractItems, lastReleaseId: "", date: "2026-06-01", releasedBy: "", drNumber: 1, periodOf: () => ({ year: 2026, month: 6, quarter: 2 }) })[0].id, "REL-0001");
}

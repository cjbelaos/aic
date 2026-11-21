import assert from "node:assert/strict";
import { computeItemLedger, computeLedgers, generatePeriods, isReleaseCounted } from "../../src/lib/contractReleases/ledger.ts";
import type { Contract, ContractItem } from "../../src/types/contract.ts";
import type { ContractRelease } from "../../src/types/contract-release.ts";

const contract = (startDate: string, endDate: string): Contract =>
  ({ id: "CTR-0001", companyId: "C1", agreementType: "Contract", startDate, endDate, status: "Active" }) as Contract;
const item = (frequency: string, entitledQty: number, status: "Active" | "Inactive" = "Active"): ContractItem =>
  ({ id: "CTI-0001", contractId: "CTR-0001", productCode: "SKU", productId: "P1", entitledQty, frequency, status }) as ContractItem;
let relN = 0;
const rel = (releaseDate: string, quantity: number, drNumber?: number, status: ContractRelease["status"] = "Completed"): ContractRelease =>
  ({ id: `REL-${String(++relN).padStart(4, "0")}`, contractItemId: "CTI-0001", contractId: "CTR-0001", periodYear: 0, periodMonth: 0, periodQuarter: 0,
    frequency: "Monthly", releaseDate, quantity, releasedBy: "t", status, drNumber }) as ContractRelease;
const none = new Map<number, string>();

// Catch-up
{
  const l = computeItemLedger(item("Monthly", 2), contract("2026-10-01", "2027-09-30"), [rel("2026-11-03", 2), rel("2026-11-25", 2)], none, "2026-11-26");
  assert.deepEqual(l.periods.map(p => [p.periodStart, p.releasedQty, p.status]), [["2026-10-01", 2, "Completed"], ["2026-11-01", 2, "Completed"]]);
  assert.equal(l.owedNow, 0);
  assert.equal(l.periods[0].releaseCount, 1);
  assert.equal(l.periods[0].daysToComplete, 0);
  const d = computeItemLedger(item("Monthly", 4), contract("2026-11-01", "2027-10-31"), [rel("2026-11-03", 2), rel("2026-11-25", 2)], none, "2026-11-26");
  assert.equal(d.periods[0].releaseCount, 2);
  assert.equal(d.periods[0].daysToComplete, 22);
  assert.equal(d.periods[0].firstReleaseDate, "2026-11-03");
  assert.equal(l.productId, "P1");
}
// Overdue / pending
{
  const z = computeItemLedger(item("Monthly", 2), contract("2026-09-01", "2027-08-31"), [], none, "2026-11-10");
  assert.deepEqual(z.periods.map(p => p.status), ["Overdue", "Overdue", "Pending"]);
  assert.equal(z.owedNow, 6); assert.equal(z.openPeriods, 3); assert.equal(z.oldestOpen, "2026-09");
  assert.equal(z.periods[0].periodId, "PER-CTI-0001-2026-09");
  assert.equal(z.periods[0].shortfall, 2);
}
// Partial current month
{
  const l = computeItemLedger(item("Monthly", 2), contract("2026-11-01", "2027-10-31"), [rel("2026-11-02", 1)], none, "2026-11-10");
  assert.equal(l.periods[0].status, "Partial"); assert.equal(l.periods[0].shortfall, 1);
}
// Never pre-pays
{
  const l = computeItemLedger(item("Monthly", 2), contract("2026-01-01", "2026-12-31"), [rel("2026-01-10", 4)], none, "2026-02-15");
  assert.equal(l.periods[0].releasedQty, 2); assert.equal(l.periods[0].status, "Completed");
  assert.equal(l.periods[1].releasedQty, 0); assert.equal(l.periods[1].status, "Pending");
  assert.equal(l.extraQty, 2); assert.equal(l.owedNow, 2);
}
// DR status
{
  const c = contract("2026-11-01", "2027-10-31");
  const q = (m: Map<number, string>) => computeItemLedger(item("Monthly", 2), c, [rel("2026-11-02", 2, 900)], m, "2026-11-10").periods[0].releasedQty;
  assert.equal(q(new Map([[900, "rejected"]])), 0);
  for (const s of ["draft", "pending_approval", "deleted"]) assert.equal(q(new Map([[900, s]])), 0);
  assert.equal(q(new Map([[900, " Printed "]])), 2);
  assert.equal(q(new Map()), 2);
  assert.equal(isReleaseCounted(rel("2026-11-02", 2, undefined, "Deleted"), none), false);
  assert.equal(isReleaseCounted(rel("2026-11-02", 2, undefined, "Cancelled"), none), false);
  assert.equal(isReleaseCounted(rel("2026-11-02", 2), none), true);
}
// Bad dates
for (const [s, e] of [["", "2027-01-01"], ["2026/01/01", "2027-01-01"], ["2026-05-01", "2026-04-01"]])
  assert.deepEqual(generatePeriods("Monthly", s, e, "2026-12-01"), []);
// Mid-period start
{
  const l = computeItemLedger(item("Quarterly", 2), contract("2026-02-15", "2027-02-14"), [], none, "2026-05-01");
  assert.deepEqual(l.periods.map(p => p.periodStart), ["2026-01-01", "2026-04-01"]);
  assert.deepEqual(l.periods.map(p => p.entitledQty), [2, 2]);
}
// Contract end
{
  const p = generatePeriods("Monthly", "2026-08-01", "2026-10-31", "2026-12-05");
  assert.equal(p[p.length - 1].periodStart, "2026-10-01");
  assert.equal(p[p.length - 1].periodEnd, "2026-10-31");
}
// Semi-annual
assert.deepEqual(generatePeriods("Semi-Annual", "2026-03-01", "2027-02-28", "2026-08-01").map(p => p.periodStart), ["2026-01-01", "2026-07-01"]);
// One-Time
{
  const p = generatePeriods("One-Time", "2026-03-10", "2027-03-09", "2026-12-01");
  assert.equal(p.length, 1); assert.equal(p[0].periodStart, "2026-03-01"); assert.equal(p[0].periodEnd, "2027-03-09");
}
// computeLedgers skips Inactive and ignores extra-item releases
{
  const items = [item("Monthly", 2), { ...item("Monthly", 2, "Inactive"), id: "CTI-0002" }];
  const extra = { ...rel("2026-11-02", 5), contractItemId: "" };
  const out = computeLedgers({ contracts: [contract("2026-11-01", "2027-10-31")], items, releases: [extra], drStatus: none, today: "2026-11-10" });
  assert.equal(out.length, 1); assert.equal(out[0].periods[0].releasedQty, 0); assert.equal(out[0].extraQty, 0);
}
